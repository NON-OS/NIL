import WebSocket from 'ws';
import { once } from 'node:events';

// Opens the live connection as a signed-in client and records every event it receives.
export default async function socket(base, cookie) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`, { headers: { Cookie: cookie } });
  const events = [];
  ws.on('message', (raw) => events.push(JSON.parse(String(raw))));
  await once(ws, 'open');
  return { events, close: () => ws.close() };
}
