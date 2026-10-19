// Everything a page reaches out to, and anything it shouldn't do: requests and WebSockets by
// host, refusals by its Content-Security-Policy, and console lines that would give away a
// pairing link or a key.
export default async function pageWatch(context) {
  const requests = new Set();
  const sockets = new Set();
  const problems = [];
  const secrets = new Set();

  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`csp-violation ${e.violatedDirective} ${e.blockedURI}`));
  });
  const watch = (page) => {
    page.on('request', (r) => requests.add(new URL(r.url()).origin));
    page.on('websocket', (ws) => sockets.add(new URL(ws.url()).origin));
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('console', (m) => {
      const text = m.text();
      if (text.startsWith('csp-violation')) problems.push(text);
      if (/wc:[0-9a-f]{20}|symKey/.test(text) || [...secrets].some((s) => text.includes(s))) problems.push('a console line held a pairing link or key');
    });
  };
  context.pages().forEach(watch);
  context.on('page', watch);

  return {
    // a pairing link: its topic and key must never show up in the console
    secret(uri) {
      const [, topic, key] = /^wc:([0-9a-f]+)@2\?.*symKey=([0-9a-f]+)/.exec(uri) ?? [];
      if (topic) secrets.add(topic);
      if (key) secrets.add(key);
    },
    origins: () => ({ requests: [...requests].sort(), sockets: [...sockets].sort() }),
    problems: () => problems.splice(0),
  };
}
