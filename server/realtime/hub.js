// Every open socket, plus who it belongs to and which task it's looking at.
const clients = new Map();
let presenceTimer = null;

function send(ws, data) {
  if (ws.readyState === ws.OPEN) ws.send(data);
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

const hub = {
  add(ws, client) {
    clients.set(ws, { viewing: null, alive: true, lastTyping: 0, ...client });
    hub.presenceChanged();
  },

  remove(ws) {
    if (clients.delete(ws)) hub.presenceChanged();
  },

  get: (ws) => clients.get(ws),

  entries: () => clients.entries(),

  // Pass a function to tailor the payload per recipient (e.g. hide wallet addresses from non-admins, or private tasks from everyone but their owner).
  broadcast(event, { except } = {}) {
    if (typeof event !== 'function') {
      const data = JSON.stringify(event);
      for (const ws of clients.keys()) if (ws !== except) send(ws, data);
      return;
    }
    // returning nothing for someone means they don't get this event at all
    for (const [ws, c] of clients) {
      if (ws === except) continue;
      const tailored = event({ id: c.userId, isAdmin: c.isAdmin });
      if (tailored) send(ws, JSON.stringify(tailored));
    }
  },

  toUser(userId, event) {
    const data = JSON.stringify(event);
    for (const [ws, c] of clients) if (c.userId === userId) send(ws, data);
  },

  setAdmin(userId, isAdmin) {
    for (const c of clients.values()) if (c.userId === userId) c.isAdmin = isAdmin;
  },

  disconnect(userId) {
    for (const [ws, c] of clients) {
      if (c.userId !== userId) continue;
      ws.close(4001, 'signed out');
      clients.delete(ws);
    }
    hub.presenceChanged();
  },

  presence: presenceSnapshot,

  // Joins and leaves often come in bursts (tab reloads), so batch them.
  presenceChanged() {
    if (presenceTimer) return;
    presenceTimer = setTimeout(() => {
      presenceTimer = null;
      hub.broadcast({ type: 'presence', presence: presenceSnapshot() });
    }, 150);
  },
};

export default hub;
