// One matrix call as `actor`: people send their session cookie (or, on the bearer-key endpoints,
// their personal key), agents and strangers their key, anonymous callers nothing. Cookies the
// server sets are never kept, so a call can't change who the actor is for the next one. Each
// call comes from its own address through the test server's trusted proxy, so the per-address
// limits (tested on their own elsewhere) don't trip over the matrix's thousand-odd calls.
const address = () => `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 250) + 1).join('.')}`;

export default async function authzRequest(world, actor, { method, url, body, raw, headers = {}, bearer = false, cookie }) {
  const auth = {};
  const sessionCookie = cookie ?? world.cookieOf(actor);
  if (bearer || actor.startsWith('agent')) {
    if (world.keys[actor]) auth.Authorization = `Bearer ${world.keys[actor]}`;
  } else if (sessionCookie) auth.Cookie = sessionCookie;
  const hasJson = body !== undefined && raw === undefined;
  const res = await fetch(world.base() + url, {
    method,
    headers: { 'X-NONOS': '1', 'X-Forwarded-For': address(), ...(hasJson ? { 'Content-Type': 'application/json' } : {}), ...auth, ...headers },
    body: raw !== undefined ? new TextEncoder().encode(raw) : hasJson ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, headers: res.headers };
}
