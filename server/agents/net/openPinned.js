import http from 'node:http';
import https from 'node:https';
import SafeFetchError from './SafeFetchError.js';
import proxyTunnel from './proxyTunnel.js';

const TRANSPORTS = { 'http:': http, 'https:': https };

// Opens one request to the address resolveTarget checked, never to a fresh DNS answer, and
// resolves as soon as the response starts: status and headers, with the body still streaming.
// The URL keeps its hostname, so the Host header, TLS server name and certificate check are
// unchanged; only the socket's address is pinned. With `proxy` (EGRESS_PROXY, on a server with no
// route out of its own) that address is reached through a CONNECT tunnel, and only over https,
// so the proxy never sees what's sent. Redirects are never followed. Errors are passed on as
// they come; callers decide what they mean.
export default function openPinned(target, { method = 'GET', headers = {}, body, signal, proxy = null, ca, transport } = {}) {
  if (proxy && target.url.protocol !== 'https:') return Promise.reject(new SafeFetchError('bad_url', 'Use an https URL: this server reaches the internet only over https.'));
  const options = { method, headers, signal };
  if (proxy) {
    const tunnel = { address: target.address, family: target.family, port: Number(target.url.port) || 443, host: target.url.hostname.replace(/^\[|\]$/g, ''), ca, signal };
    options.createConnection = (_, done) => {
      proxyTunnel(proxy, tunnel).then((socket) => done(null, socket), (err) => done(err));
    };
  } else {
    options.lookup = (hostname, opts, callback) => {
      const done = typeof opts === 'function' ? opts : callback;
      if (opts?.all) done(null, [{ address: target.address, family: target.family }]);
      else done(null, target.address, target.family);
    };
    if (ca) options.ca = ca;
  }

  return new Promise((resolve, reject) => {
    const request = (proxy ? https : (transport ?? TRANSPORTS[target.url.protocol])).request(target.url, options, resolve);
    request.on('error', reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}
