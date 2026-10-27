import { WebSocketServer } from 'ws';
import hub from './hub.js';
import currentUser from '../auth/currentUser.js';
import sessions from '../auth/sessions.js';
import sessionCookie from '../auth/sessionCookie.js';
import tokenHash from '../auth/tokenHash.js';
import originAllowed from '../security/originAllowed.js';
import loadTask from '../services/loadTask.js';
import canSeeTask from '../services/canSeeTask.js';
import logLimited from '../lib/logLimited.js';
import buildId from '../lib/buildId.js';
import config from '../config.js';
import callSocket from '../calls/callSocket.js';

const TYPING_INTERVAL_MS = 1500;
const HEARTBEAT_MS = 30_000;
// how long tabs get to answer a closing handshake on shutdown before their sockets are cut
const CLOSE_GRACE_MS = 1000;

function refuse(socket, status) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function handleMessage(ws, raw) {
  const client = hub.get(ws);
  if (!client) return;
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (msg?.type === 'presence') {
    // Looking at a private task shows up as looking at nothing, and nobody can claim to be on
    // a task they can't open. Each viewer is then sent only what they may see.
    const id = typeof msg.viewing === 'string' ? msg.viewing.slice(0, 32) : null;
    const task = id ? loadTask(id) : null;
    const viewing = task && !task.private && canSeeTask(task, { id: client.userId }) ? id : null;
    if (viewing !== client.viewing) {
      client.viewing = viewing;
      hub.presenceChanged();
    }
  } else if (msg?.type === 'typing' && typeof msg.taskId === 'string') {
    const now = Date.now();
    if (now - client.lastTyping < TYPING_INTERVAL_MS) return;
    client.lastTyping = now;
    const task = loadTask(msg.taskId.slice(0, 32));
    if (!canSeeTask(task, { id: client.userId })) return;
    const typing = { type: 'typing', taskId: task.id, userId: client.userId };
    hub.broadcast((viewer) => (canSeeTask(task, viewer) ? typing : null), { except: ws });
  } else if (typeof msg?.type === 'string' && msg.type.startsWith('call.')) {
    callSocket(ws, client, msg);
  }
}

// Socket events run outside Express, so nothing else would catch an error thrown here, and an
// uncaught one stops the whole server. A broken message costs only that message; a broken
// handshake costs only that connection. Logging is rate-limited because any client can send junk.
function guarded(key, fn, onError) {
  return (...args) => {
    try {
      fn(...args);
    } catch (err) {
      logLimited(`realtime:${key}`, 'error', 'realtime', `The live ${key} handler failed.`, err);
      onError?.(...args);
    }
  };
}

function connected(ws, user, session) {
  hub.add(ws, { userId: user.id, isAdmin: user.isAdmin, session });
  ws.on('pong', () => {
    const c = hub.get(ws);
    if (c) c.alive = true;
  });
  // Each message costs a lookup and may reach every other tab, so a socket that sends far more
  // than the app ever does is closed (1008, policy violation) instead of slowing everyone down.
  let budget = { start: Date.now(), count: 0 };
  ws.on(
    'message',
    guarded('message', (raw) => {
      const now = Date.now();
      if (now - budget.start > 60_000) budget = { start: now, count: 0 };
      if (++budget.count > config.realtimeMessagesPerMinute) return ws.close(1008, 'too many messages');
      handleMessage(ws, raw);
    }),
  );
  ws.on('close', () => {
    hub.remove(ws);
    callSocket.closed(ws);
  });
  ws.on('error', () => hub.remove(ws));
  // the build lets a tab that reconnects after a deploy see it's running an old version
  ws.send(JSON.stringify({ type: 'hello', presence: hub.presenceFor({ id: user.id, isAdmin: user.isAdmin }), build: buildId() }));
}

export default function attachRealtime(server) {
  // a call's handshake carries a whole session description, so frames may be a little larger
  const wss = new WebSocketServer({ noServer: true, maxPayload: Math.max(16 * 1024, config.calls.maxSignalBytes + 2048) });
  let closing = false;

  function upgrade(req, socket, head) {
    if (closing) return refuse(socket, '503 Service Unavailable');
    if (new URL(req.url, 'http://x').pathname !== '/ws') return refuse(socket, '404 Not Found');
    if (!originAllowed(req)) return refuse(socket, '403 Forbidden');
    const user = currentUser(req);
    if (!user) return refuse(socket, '401 Unauthorized');
    const session = tokenHash(sessionCookie.read(req));
    wss.handleUpgrade(req, socket, head, guarded('connection', (ws) => connected(ws, user, session), (ws) => ws.terminate()));
  }

  server.on(
    'upgrade',
    guarded('upgrade', upgrade, (req, socket) => {
      if (socket.writable) refuse(socket, '500 Internal Server Error');
      else socket.destroy();
    }),
  );

  // Drop sockets that stopped answering pings (sleeping laptops, dead proxies), and sockets
  // whose session ended some other way: it expired, or it was revoked from another device.
  const heartbeat = setInterval(
    guarded('heartbeat', () => {
      for (const [ws, c] of hub.entries()) {
        if (!sessions.isLive(c.session)) {
          ws.close(4001, 'signed out');
          hub.remove(ws);
          continue;
        }
        if (!c.alive) {
          ws.terminate();
          hub.remove(ws);
          continue;
        }
        c.alive = false;
        ws.ping();
      }
    }),
    HEARTBEAT_MS,
  ).unref();

  return {
    // On shutdown: 1001 (going away) tells each tab to reconnect, which lands on the next server
    // process. Sockets that don't finish the closing handshake in time are cut.
    async close() {
      closing = true;
      clearInterval(heartbeat);
      const sockets = [...hub.entries()].map(([ws]) => ws);
      const closed = sockets.map((ws) => (ws.readyState === ws.CLOSED ? null : new Promise((resolve) => ws.once('close', resolve))));
      for (const ws of sockets) ws.close(1001, 'Server restarting');
      const cut = setTimeout(() => sockets.forEach((ws) => ws.terminate()), CLOSE_GRACE_MS);
      await Promise.all(closed);
      clearTimeout(cut);
      wss.close();
    },
  };
}
