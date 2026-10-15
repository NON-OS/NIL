import { WebSocketServer } from 'ws';
import hub from './hub.js';
import currentUser from '../auth/currentUser.js';
import originAllowed from '../security/originAllowed.js';

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
    const viewing = typeof msg.viewing === 'string' ? msg.viewing.slice(0, 32) : null;
    if (viewing !== client.viewing) {
      client.viewing = viewing;
      hub.presenceChanged();
    }
  } else if (msg?.type === 'typing' && typeof msg.taskId === 'string') {
    const now = Date.now();
    if (now - client.lastTyping < TYPING_INTERVAL_MS) return;
    client.lastTyping = now;
    hub.broadcast({ type: 'typing', taskId: msg.taskId.slice(0, 32), userId: client.userId }, { except: ws });
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
      ws.send(JSON.stringify({ type: 'hello', presence: hub.presence() }));
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
