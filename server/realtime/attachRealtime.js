import { WebSocketServer } from 'ws';
import hub from './hub.js';
import currentUser from '../auth/currentUser.js';
import sessions from '../auth/sessions.js';
import sessionCookie from '../auth/sessionCookie.js';
import tokenHash from '../auth/tokenHash.js';
import originAllowed from '../security/originAllowed.js';
import loadTask from '../services/loadTask.js';
import canSeeTask from '../services/canSeeTask.js';

const TYPING_INTERVAL_MS = 1500;
const HEARTBEAT_MS = 30_000;

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
    hub.broadcast((viewer) => (canSeeTask(task, viewer) ? { type: 'typing', taskId: task.id, userId: client.userId } : null), { except: ws });
  }
}

export default function attachRealtime(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== '/ws') return refuse(socket, '404 Not Found');
    if (!originAllowed(req)) return refuse(socket, '403 Forbidden');
    const user = currentUser(req);
    if (!user) return refuse(socket, '401 Unauthorized');

    wss.handleUpgrade(req, socket, head, (ws) => {
      hub.add(ws, { userId: user.id, isAdmin: user.isAdmin, session: tokenHash(sessionCookie.read(req)) });
      ws.on('pong', () => {
        const c = hub.get(ws);
        if (c) c.alive = true;
      });
      ws.on('message', (raw) => handleMessage(ws, raw));
      ws.on('close', () => hub.remove(ws));
      ws.on('error', () => hub.remove(ws));
      ws.send(JSON.stringify({ type: 'hello', presence: hub.presenceFor({ id: user.id, isAdmin: user.isAdmin }) }));
    });
  });

  // Drop sockets that stopped answering pings (sleeping laptops, dead proxies), and sockets
  // whose session ended some other way: it expired, or it was revoked from another device.
  setInterval(() => {
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
  }, HEARTBEAT_MS).unref();
}
