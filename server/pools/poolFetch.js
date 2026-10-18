import config from '../config.js';
import HttpError from '../lib/HttpError.js';

const PATHS = {
  relayer: new Set(['/relayer/quote', '/relayer/request']),
  asp: /^\/\d+\/public\/(mt-leaves|mt-roots|deposits-by-label)$/,
};
const HEADER_VALUE = /^[0-9a-zA-Z,]{1,8192}$/;

const down = (who) => new HttpError(502, `Nil couldn’t reach the ${who === 'relayer' ? 'Privacy Pools relayer' : 'association set provider'}. Try again in a minute.`);

async function body(res, who) {
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > config.pools.maxResponseBytes) throw down(who);
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body ?? []) {
    size += chunk.length;
    if (size > config.pools.maxResponseBytes) throw down(who);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw down(who);
  }
}

// The one way the server calls the relayer or the association set provider for a browser. The
// host is always the configured one and the path one of a fixed few, so a request can never be
// pointed anywhere else, redirects are refused, and nothing about the caller is passed along: no
// cookies, no client address, no headers but the ones named here.
export default async function poolFetch(who, path, { method = 'GET', json, headers = {}, timeoutMs = config.pools.timeoutMs } = {}) {
  const base = who === 'relayer' ? config.pools.relayerUrl : who === 'asp' ? config.pools.aspUrl : null;
  const allowed = PATHS[who];
  if (!base || !(allowed instanceof Set ? allowed.has(path) : allowed.test(path))) throw new Error(`poolFetch refused ${who} ${path}`);
  for (const value of Object.values(headers)) if (!HEADER_VALUE.test(value)) throw HttpError.badRequest('That request is malformed.');
  const url = new URL(`${base}${path}`);
  if (url.origin !== new URL(base).origin) throw new Error(`poolFetch refused ${who} ${path}`);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json ? JSON.stringify(json) : undefined,
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw down(who);
  }
  const data = await body(res, who);
  return { ok: res.ok, status: res.status, data };
}
