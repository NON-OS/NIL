import presenceFor from './presenceFor.js';
import config from '../config.js';

// Every open socket, plus who it belongs to, the session it opened with, and which task it's
// looking at; and each person's sockets, so an event for one person costs only their own tabs.
const clients = new Map();
const byUser = new Map();
// the sockets that have each doc open, for cursors
const byDoc = new Map();
let presenceTimer = null;

// A tab that stopped reading (asleep, on a dead link, or not reading on purpose) is cut off once
// what waits for it passes REALTIME_MAX_BUFFERED_KB, before its backlog fills the server's memory.
function send(ws, data) {
  if (ws.readyState !== ws.OPEN) return;
  if (ws.bufferedAmount > config.realtimeMaxBufferedBytes) {
    ws.terminate();
    hub.remove(ws);
    return;
  }
  ws.send(data);
}

function leaveDoc(ws, c) {
  const open = c.docOpen && byDoc.get(c.docOpen);
  open?.delete(ws);
  if (open && !open.size) byDoc.delete(c.docOpen);
  c.docOpen = null;
}

function forget(ws) {
  const c = clients.get(ws);
  if (!c) return false;
  leaveDoc(ws, c);
  clients.delete(ws);
  const mine = byUser.get(c.userId);
  mine?.delete(ws);
  if (mine && !mine.size) byUser.delete(c.userId);
  return true;
}

function presenceSnapshot() {
  const byUser = new Map();
  for (const c of clients.values()) {
    const entry = byUser.get(c.userId) ?? { userId: c.userId, viewing: [] };
    if (c.viewing && !entry.viewing.includes(c.viewing)) entry.viewing.push(c.viewing);
    byUser.set(c.userId, entry);
  }
  return [...byUser.values()];
}

function closeWhere(match) {
  for (const [ws, c] of [...clients]) {
    if (!match(c)) continue;
    ws.close(4001, 'signed out');
    forget(ws);
  }
  hub.presenceChanged();
}

const hub = {
  add(ws, client) {
    clients.set(ws, { viewing: null, alive: true, lastTyping: 0, ...client });
    if (!byUser.has(client.userId)) byUser.set(client.userId, new Set());
    byUser.get(client.userId).add(ws);
    hub.presenceChanged();
  },

  remove(ws) {
    if (forget(ws)) hub.presenceChanged();
  },

  // which doc a socket has open, or none
  openDoc(ws, docId) {
    const c = clients.get(ws);
    if (!c) return;
    leaveDoc(ws, c);
    if (!docId) return;
    c.docOpen = docId;
    if (!byDoc.has(docId)) byDoc.set(docId, new Set());
    byDoc.get(docId).add(ws);
  },

  // the sockets with a doc open, and who they belong to
  onDoc: (docId) => [...(byDoc.get(docId) ?? [])].map((ws) => [ws, clients.get(ws)]),

  send,

  // open sockets, for one person or in all
  count: (userId) => (userId === undefined ? clients.size : (byUser.get(userId)?.size ?? 0)),

  get: (ws) => clients.get(ws),

  entries: () => clients.entries(),

  // Pass a function to tailor the payload per recipient (e.g. hide wallet addresses from non-admins, or private tasks from everyone but their owner).
  // Return the same object to everyone who should get the same payload: it's encoded once for
  // all of them instead of once per open tab.
  broadcast(event, { except } = {}) {
    if (typeof event !== 'function') {
      const data = JSON.stringify(event);
      for (const ws of [...clients.keys()]) if (ws !== except) send(ws, data);
      return;
    }
    const encoded = new Map();
    // returning nothing for someone means they don't get this event at all
    for (const [ws, c] of [...clients]) {
      if (ws === except) continue;
      const tailored = event({ id: c.userId, isAdmin: c.isAdmin });
      if (!tailored) continue;
      let data = encoded.get(tailored);
      if (data === undefined) {
        data = JSON.stringify(tailored);
        encoded.set(tailored, data);
      }
      send(ws, data);
    }
  },

  toUser(userId, event) {
    hub.toUsers([userId], event);
  },

  // The same event for several people, encoded once, and not at all if none of them is online.
  toUsers(userIds, event) {
    let data;
    for (const userId of new Set(userIds)) {
      const mine = byUser.get(userId);
      if (!mine) continue;
      data ??= JSON.stringify(event);
      for (const ws of [...mine]) send(ws, data);
    }
  },

  setAdmin(userId, isAdmin) {
    for (const c of clients.values()) if (c.userId === userId) c.isAdmin = isAdmin;
  },

  // Closes every socket of a person (removed, deactivated) or of one session (signed out).
  disconnect(userId) {
    closeWhere((c) => c.userId === userId);
  },

  endSession(sessionHash) {
    closeWhere((c) => c.session === sessionHash);
  },

  // what one viewer may see of who's online and where
  presenceFor: (viewer) => presenceFor(presenceSnapshot(), viewer),

  // Joins and leaves often come in bursts (tab reloads), so batch them.
  presenceChanged() {
    if (presenceTimer) return;
    presenceTimer = setTimeout(() => {
      presenceTimer = null;
      const snapshot = presenceSnapshot();
      hub.broadcast((viewer) => ({ type: 'presence', presence: presenceFor(snapshot, viewer) }));
    }, 150);
  },
};

export default hub;
