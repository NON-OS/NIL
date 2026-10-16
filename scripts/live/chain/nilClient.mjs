import SETUP_TOKEN from './setupToken.mjs';

// One person's session with Nil's API, the way the app makes requests: its own cookie and the
// X-NONOS header. Fails on any answer other than 2xx unless `expect` names the status.
export default function nilClient(base, { chainId = 1 } = {}) {
  let cookie = '';
  async function call(method, url, body, { expect = null } = {}) {
    const res = await fetch(base + url, {
      method,
      headers: { 'X-NONOS': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    if (expect !== null ? res.status !== expect : res.status >= 300) {
      throw new Error(`${method} ${url} answered ${res.status}${expect !== null ? ` (expected ${expect})` : ''}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
    }
    return data;
  }
  const api = {
    get: (url, opts) => call('GET', `/api${url}`, undefined, opts),
    post: (url, body = {}, opts) => call('POST', `/api${url}`, body, opts),
    put: (url, body = {}, opts) => call('PUT', `/api${url}`, body, opts),
    patch: (url, body = {}, opts) => call('PATCH', `/api${url}`, body, opts),
    del: (url, opts) => call('DELETE', `/api${url}`, undefined, opts),
    // the shape the server's test helpers take: (method, '/api/...', body) to { status, data }
    async raw(method, url, body) {
      const res = await fetch(base + url, {
        method,
        headers: { 'X-NONOS': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = text;
      try {
        data = JSON.parse(text);
      } catch {}
      return { status: res.status, data };
    },
    // Sign-In with Ethereum for any wallet that can sign a message: a plain key or a smart wallet
    async wallet(w, mode, extra = {}, opts = {}) {
      const token = mode === 'setup' ? { setupToken: SETUP_TOKEN } : {};
      const challenge = await api.post('/auth/wallet/challenge', { address: w.address, mode, chainId, ...token, ...extra });
      return api.post('/auth/wallet/verify', { challengeId: challenge.challengeId, signature: await w.signMessage(challenge.message) }, opts);
    },
  };
  return api;
}
