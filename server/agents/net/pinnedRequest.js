import SafeFetchError from './SafeFetchError.js';
import openPinned from './openPinned.js';

// Sends one request to the address resolveTarget checked (see openPinned.js, which also covers
// EGRESS_PROXY) and reads the whole answer, capped at `maxBytes`, within `timeoutMs`.
export default async function pinnedRequest(target, { method = 'GET', headers = {}, body, timeoutMs = 10_000, signal, maxBytes = 1024 * 1024, transport, proxy = null, ca } = {}) {
  const stop = AbortSignal.any([AbortSignal.timeout(timeoutMs), signal].filter(Boolean));
  const failure = (err) => {
    if (err instanceof SafeFetchError) return err;
    if (err.name === 'AbortError' || err.code === 'ABORT_ERR' || stop.aborted) {
      return new SafeFetchError('timeout', signal?.aborted ? 'The request was cancelled.' : `No answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    return new SafeFetchError('network', err.code ? `${err.code}: ${err.message}` : err.message);
  };

  let res;
  try {
    res = await openPinned(target, { method, headers, body, signal: stop, proxy, ca, transport });
  } catch (err) {
    throw failure(err);
  }
  return new Promise((resolve, reject) => {
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
    res.on('error', (err) => reject(failure(err)));
  });
}
