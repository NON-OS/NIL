import http from 'node:http';
import https from 'node:https';
import SafeFetchError from './SafeFetchError.js';

const TRANSPORTS = { 'http:': http, 'https:': https };

// Sends one request to the address resolveTarget checked, never to a fresh DNS answer. The URL
// keeps its hostname, so the Host header, TLS server name and certificate check are unchanged;
// only the socket's address is pinned. Redirects are not followed, and the response is capped.
export default function pinnedRequest(target, { method = 'GET', headers = {}, body, timeoutMs = 10_000, signal, maxBytes = 1024 * 1024, transport } = {}) {
  const lookup = (hostname, options, callback) => {
    const done = typeof options === 'function' ? options : callback;
    if (options?.all) done(null, [{ address: target.address, family: target.family }]);
    else done(null, target.address, target.family);
  };
  const signals = [AbortSignal.timeout(timeoutMs), signal].filter(Boolean);

  return new Promise((resolve, reject) => {
    const request = (transport ?? TRANSPORTS[target.url.protocol]).request(target.url, { method, headers, lookup, signal: AbortSignal.any(signals) }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          res.destroy();
          reject(new SafeFetchError('too_large', 'The response was too large.'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) });
      });
      res.on('error', (err) => reject(new SafeFetchError('network', err.message)));
    });
    request.on('error', (err) => {
      if (err.name === 'AbortError' || err.code === 'ABORT_ERR') {
        reject(new SafeFetchError('timeout', signal?.aborted ? 'The request was cancelled.' : `No answer within ${Math.round(timeoutMs / 1000)} seconds.`));
      } else reject(new SafeFetchError('network', err.code ? `${err.code}: ${err.message}` : err.message));
    });
    if (body !== undefined) request.write(body);
    request.end();
  });
}
