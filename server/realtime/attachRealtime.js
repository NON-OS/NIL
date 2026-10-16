import { WebSocketServer } from 'ws';
import hub from './hub.js';
import currentUser from '../auth/currentUser.js';
import originAllowed from '../security/originAllowed.js';
import loadTask from '../services/loadTask.js';
import canSeeTask from '../services/canSeeTask.js';
import buildId from '../lib/buildId.js';

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
    // Presence goes to everyone, so looking at a private task shows up as looking at nothing.
    const id = typeof msg.viewing === 'string' ? msg.viewing.slice(0, 32) : null;
    const viewing = id && !loadTask(id)?.private ? id : null;
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
      hub.add(ws, { userId: user.id, isAdmin: user.isAdmin });
      ws.on('pong', () => {
        const c = hub.get(ws);
        if (c) c.alive = true;
      });
      ws.on('message', (raw) => handleMessage(ws, raw));
      ws.on('close', () => hub.remove(ws));
      ws.on('error', () => hub.remove(ws));
      // the build lets a tab that reconnects after a deploy see it's running an old version
      ws.send(JSON.stringify({ type: 'hello', presence: hub.presence(), build: buildId() }));
    });
  });

  // Drop sockets that stopped answering pings (sleeping laptops, dead proxies).
  setInterval(() => {
    for (const [ws, c] of hub.entries()) {
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
