import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import signRequest from './signRequest.js';

const xmlValue = (xml, tag) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] ?? null;
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

// Just enough S3 for backups: streaming multipart upload and download, path-style addressing
// so it works with any S3-compatible store (Hetzner Object Storage, MinIO, Backblaze, R2, AWS).
// The access key only needs to write objects (and read them, for restores from the bucket), and
// to read the bucket's versioning and Object Lock settings for the check at startup.
export default function createS3Client({ endpoint, region, bucket, accessKeyId, secretAccessKey, partBytes, fetchImpl = fetch, timeoutMs = 300_000 }) {
  async function send(method, key, { query = {}, body, headers = {} } = {}) {
    const url = new URL(`${endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const payloadHash = sha256(body ?? '');
    const signed = signRequest({ method, url, headers, payloadHash, accessKeyId, secretAccessKey, region });
    // fetch sets Host itself, from the same URL that was signed
    delete signed.host;
    const res = await fetchImpl(url, { method, headers: signed, body, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status >= 300) {
      const text = await res.text().catch(() => '');
      const err = new Error(`S3 ${method} failed with ${res.status}${xmlValue(text, 'Code') ? ` (${xmlValue(text, 'Code')}: ${xmlValue(text, 'Message')})` : ''}.`);
      throw Object.assign(err, { status: res.status });
    }
    return res;
  }

  return {
    // Uploads a stream of unknown length in parts of partBytes, one part in memory at a time.
    async put(key, readable) {
      const started = await (await send('POST', key, { query: { uploads: '' } })).text();
      const uploadId = xmlValue(started, 'UploadId');
      if (!uploadId) throw new Error('S3 didn’t start the upload.');
      const parts = [];
      let bytes = 0;
      const flush = async (buffer) => {
        const res = await send('PUT', key, { query: { partNumber: String(parts.length + 1), uploadId }, body: buffer });
        const etag = res.headers.get('etag');
        if (!etag) throw new Error('S3 accepted a part without returning its ETag.');
        parts.push(etag);
        bytes += buffer.length;
      };
      try {
        let pending = [];
        let pendingLength = 0;
        for await (const chunk of readable) {
          pending.push(chunk);
          pendingLength += chunk.length;
          while (pendingLength >= partBytes) {
            const buffer = Buffer.concat(pending);
            pending = [buffer.subarray(partBytes)];
            pendingLength = pending[0].length;
            await flush(buffer.subarray(0, partBytes));
          }
        }
        if (pendingLength || !parts.length) await flush(Buffer.concat(pending));
        const xml = `<CompleteMultipartUpload>${parts.map((etag, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etag}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
        const done = await (await send('POST', key, { query: { uploadId }, body: Buffer.from(xml), headers: { 'content-type': 'application/xml' } })).text();
        // S3 can answer 200 and still report a failure in the body
        if (/<Error>/.test(done)) throw new Error(`S3 couldn’t finish the upload (${xmlValue(done, 'Code')}).`);
        return { location: `s3://${bucket}/${key}`, bytes };
      } catch (err) {
        await send('DELETE', key, { query: { uploadId } }).catch(() => {});
        throw err;
      }
    },

    async get(key) {
      const res = await send('GET', key);
      return Readable.fromWeb(res.body);
    },

    // Whether the bucket keeps every version and locks them: without both, the server's own key
    // could overwrite or delete every backup it ever made.
    async protection() {
      const read = async (query) => {
        try {
          return await (await send('GET', '', { query })).text();
        } catch (err) {
          // a bucket that never had Object Lock answers 404
          if (err.status === 404) return '';
          throw err;
        }
      };
      const versioning = xmlValue(await read({ versioning: '' }), 'Status');
      const lock = await read({ 'object-lock': '' });
      const days = Number(xmlValue(lock, 'Days')) || Number(xmlValue(lock, 'Years')) * 365 || 0;
      return { versioning: versioning === 'Enabled', objectLock: xmlValue(lock, 'ObjectLockEnabled') === 'Enabled', mode: xmlValue(lock, 'Mode'), days };
    },
  };
}
