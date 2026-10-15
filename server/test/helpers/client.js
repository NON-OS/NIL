// A minimal browser stand-in: keeps its own cookie and sends the CSRF header.
export default function client(base) {
  let cookie = '';
  const call = async (method, url, body, headers = {}) => {
    const binary = body instanceof Uint8Array;
    const res = await fetch(base() + url, {
      method,
      headers: {
        'X-NONOS': '1',
        ...(body !== undefined && !binary ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: binary ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data, headers: res.headers };
  };
  call.cookie = () => cookie;
  // Runs the whole Sign-In with Ethereum ceremony for one of the wallet modes.
  call.wallet = async (w, mode, extra = {}) => {
    const challenge = await call('POST', '/api/auth/wallet/challenge', { address: w.address, mode, ...extra });
    if (challenge.status !== 200) return challenge;
    return call('POST', '/api/auth/wallet/verify', { challengeId: challenge.data.challengeId, signature: w.sign(challenge.data.message) });
  };
  return call;
}
