import WebSocket from 'ws';
import { once } from 'node:events';

// Opens the live connection as a signed-in client and records every event it receives.
export default async function socket(base, cookie) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`, { headers: { Cookie: cookie } });
  const events = [];
  ws.on('message', (raw) => events.push(JSON.parse(String(raw))));
  // resolves with the close code once the server or the test closes it
  const closed = once(ws, 'close').then(([code]) => code);
  await once(ws, 'open');
  return { events, closed, send: (msg) => ws.send(JSON.stringify(msg)), close: () => ws.close() };
}
