import WebSocket from 'ws';
import { once } from 'node:events';

// A signed-in tab's live connection, for call tests: it sends call messages and waits for the
// events it's told to expect, failing after a while instead of hanging the test.
export default async function callSocket(base, cookie) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`, { headers: { Cookie: cookie } });
  const events = [];
  const waiters = new Set();
  ws.on('error', () => {});
  ws.on('message', (raw) => {
    const event = JSON.parse(String(raw));
    events.push(event);
    for (const w of [...waiters]) if (w.match(event)) w.resolve(event);
  });
  await once(ws, 'open');
  return {
    ws,
    events,
    send: (msg) => ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)),
    // the first event of `type` from now on, or already received when `seen` is true
    next(type, match = () => true, { timeoutMs = 3000, seen = false } = {}) {
      const test = (e) => e.type === type && match(e);
      if (seen) {
        const found = events.find(test);
        if (found) return Promise.resolve(found);
      }
      return new Promise((resolve, reject) => {
        const w = {
          match: test,
          resolve: (e) => {
            waiters.delete(w);
            clearTimeout(timer);
            resolve(e);
          },
        };
        const timer = setTimeout(() => {
          waiters.delete(w);
          reject(new Error(`no ${type} event`));
        }, timeoutMs);
        waiters.add(w);
      });
    },
    // whether an event of `type` arrives within `ms`
    async quiet(type, ms = 300, match = () => true) {
      const before = events.length;
      await new Promise((r) => setTimeout(r, ms));
      return !events.slice(before).some((e) => e.type === type && match(e));
    },
    close: () => ws.close(),
  };
}
