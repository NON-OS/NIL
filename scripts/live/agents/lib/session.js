// A person in the Nil web app, minus the browser: keeps the session cookie and sends the CSRF
// header the app expects. `cookie` restores a saved session.
export default function session(base, { cookie = '' } = {}) {
  let jar = cookie;
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        'X-NONOS': '1',
        Origin: base,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(jar ? { Cookie: jar } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) jar = setCookie.split(';')[0];
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data, headers: res.headers };
  };
  call.cookie = () => jar;
  // The Sign-In with Ethereum ceremony: "setup" creates the workspace, "invite" joins it.
  call.signIn = async (w, mode, extra = {}) => {
    const challenge = await call('POST', '/api/auth/wallet/challenge', { address: w.address, mode, ...extra });
    if (challenge.status !== 200) return challenge;
    return call('POST', '/api/auth/wallet/verify', { challengeId: challenge.data.challengeId, signature: w.sign(challenge.data.message) });
  };
  return call;
}
