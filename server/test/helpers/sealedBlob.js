import crypto from 'node:crypto';

// Sealed blobs as a browser uploads them. The server can't read the chunks, so random bytes of
// the sizes the format calls for stand in: every chunk but the last is 1 MiB and its 16-byte tag.
const CHUNK = 1024 * 1024;
const TAG = 16;
const OPAQUE = { 'Content-Type': 'application/octet-stream' };

const chunkCount = (plain) => Math.max(1, Math.ceil(plain / CHUNK));
const sizes = (plain) => {
  const n = chunkCount(plain);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? CHUNK : plain - CHUNK * (n - 1)) + TAG);
};
const header = () => Buffer.concat([Buffer.from([1]), crypto.randomBytes(7)]).toString('base64url');

const sealedBlob = {
  CHUNK,
  TAG,
  sizes,
  header,
  // the start request's body for a file of `plain` bytes
  body: (scope, plain) => ({ scope, size: sizes(plain).reduce((a, b) => a + b, 0), chunks: chunkCount(plain), header: header() }),
  start: (c, scope, plain, extra = {}) => c('POST', '/api/blobs', { ...sealedBlob.body(scope, plain), ...extra }),
  put: (c, id, index, bytes) => c('PUT', `/api/blobs/${id}/chunks/${index}`, new Uint8Array(bytes), OPAQUE),

  // Uploads and finishes a blob of `plain` bytes, with anything `extra` the start takes (such as
  // the blob a fresh copy replaces); returns its id and the chunks sent.
  async upload(c, scope, plain = 100, extra = {}) {
    const started = await sealedBlob.start(c, scope, plain, extra);
    if (started.status !== 200) throw new Error(`start answered ${started.status}: ${JSON.stringify(started.data)}`);
    const id = started.data.blob;
    const chunks = sizes(plain).map((n) => crypto.randomBytes(n));
    for (const [i, bytes] of chunks.entries()) {
      const res = await sealedBlob.put(c, id, i, bytes);
      if (res.status !== 200) throw new Error(`chunk ${i} answered ${res.status}: ${JSON.stringify(res.data)}`);
    }
    const done = await c('POST', `/api/blobs/${id}/finish`);
    if (done.status !== 200) throw new Error(`finish answered ${done.status}: ${JSON.stringify(done.data)}`);
    return { id, chunks };
  },
};

export default sealedBlob;
