import injectWallet from '../injectWallet.mjs';

// One person's own browser: a fresh context with their wallet injected. Anything that goes wrong
// on the page, an uncaught error, a console error or an API answer of 400 and up, is collected
// in `problems`, so a step that looks fine on screen still fails when something broke.
export default async function openPerson(ctx, name, wallet) {
  const context = await ctx.browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const problems = [];
  page.on('pageerror', (e) => problems.push(`${name}: page error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`${name}: console: ${m.text()}`));
  page.on('response', async (r) => {
    if (r.status() < 400 || !r.url().includes('/api/')) return;
    problems.push(`${name}: ${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  });
  const control = await injectWallet(page, wallet, { rpcUrl: ctx.anvil.url });
  // the app's own API, from inside the signed-in page
  const api = (method, url, body) => page.evaluate(async ({ method, url, body }) => {
    const r = await fetch(`/api${url}`, { method, headers: { 'X-NONOS': '1', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return r.json();
  }, { method, url, body });
  return { name, wallet, page, context, problems, control, api };
}
