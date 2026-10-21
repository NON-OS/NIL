import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import config from '../../config.js';
import resolveTarget from './resolveTarget.js';
import openPinned from './openPinned.js';

const NO_BODY = new Set([101, 103, 204, 205, 304]);
const DECODERS = { gzip: () => zlib.createGunzip(), 'x-gzip': () => zlib.createGunzip(), deflate: () => zlib.createInflate(), br: () => zlib.createBrotliDecompress() };

async function bodyOf(body) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string' || Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof URLSearchParams) return body.toString();
  // a stream or a Blob: requests to model providers are small, so they're read whole
  return Buffer.from(await new Response(body).arrayBuffer());
}

// fetch(), for code that calls out to the internet on a person's behalf: AI providers with the
// workspace's own keys, webhooks, model endpoints. The same rules as safeFetch (no private,
// loopback, link-local or metadata addresses, DNS resolved once and the checked address pinned,
// through EGRESS_PROXY when the server has one), but it answers with a real Response whose body
// streams as it arrives, so server-sent events work. Only an error answer that isn't a stream is
// capped. It fits the `fetch` option of the Anthropic and OpenAI SDKs. Besides the usual init it
// takes `allowLocal`, `proxy`, `resolve` and `ca`, for tests and for the rare caller that needs them.
export default async function proxiedFetch(input, init = {}) {
  const request = input instanceof Request ? input : null;
  const url = request ? request.url : String(input instanceof URL ? input.href : input);
  const signal = init.signal ?? request?.signal ?? undefined;
  const headers = new Headers(init.headers ?? request?.headers);
  // fetch hands answers over decompressed, and so does this, whatever the caller asked for
  headers.set('accept-encoding', 'gzip, deflate, br');
  const method = (init.method ?? request?.method ?? 'GET').toUpperCase();
  const raw = init.body !== undefined ? init.body : request && request.body ? await request.arrayBuffer() : undefined;
  const { allowLocal = config.agents.allowLocalEndpoints, proxy = config.agents.egressProxy, resolve, ca } = init;

  let res;
  try {
    const target = await resolveTarget(url, { allowLocal, resolve });
    res = await openPinned(target, { method, headers: Object.fromEntries(headers), body: await bodyOf(raw), signal, proxy, ca });
  } catch (err) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('This operation was aborted', 'AbortError');
    throw new TypeError(err.message || 'fetch failed', { cause: err });
  }

  const out = new Headers();
  for (let i = 0; i < res.rawHeaders.length; i += 2) out.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
  let stream = res;
  const decode = DECODERS[String(res.headers['content-encoding'] ?? '').trim().toLowerCase()];
  if (decode) {
    stream = res.pipe(decode());
    res.on('error', (err) => stream.destroy(err));
    out.delete('content-encoding');
    out.delete('content-length');
  }
  const status = res.statusCode;
  const meta = { status, statusText: res.statusMessage ?? '', headers: out };
  if (NO_BODY.has(status) || method === 'HEAD') {
    res.resume();
    return new Response(null, meta);
  }
  // an error page can be any size and nobody streams it, so only so much of it is kept
  if (status >= 400 && !/text\/event-stream/i.test(res.headers['content-type'] ?? '')) {
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > config.agents.errorBodyBytes) {
        stream.destroy();
        break;
      }
      chunks.push(chunk);
    }
    out.delete('content-length');
    return new Response(Buffer.concat(chunks), meta);
  }
  return new Response(Readable.toWeb(stream), meta);
}
