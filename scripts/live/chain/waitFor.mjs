// Polls until `check` returns something truthy and returns it. Nil's background jobs run every
// few seconds in a live check, so most states arrive within one or two of their runs.
export default async function waitFor(check, { timeoutMs = 30_000, every = 500, what = 'the condition' } = {}) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    last = await check();
    if (last) return last;
    await new Promise((r) => setTimeout(r, every));
  }
  throw new Error(`Timed out waiting for ${what}${last !== undefined ? ` (last: ${JSON.stringify(last)?.slice(0, 200)})` : ''}`);
}
