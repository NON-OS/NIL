import fs from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import HttpError from './HttpError.js';

// Streams a request body to disk, so a file never sits in memory whole. It's written next to
// `target` under a .part suffix and renamed into place once complete; a body over `limit`
// bytes is cut off and what arrived of it removed. With `timeoutMs` a body that hasn't all
// arrived by then is given up, however slowly it trickles in; with `flush` the bytes are on the
// disk itself, not only in its cache, before the file takes its name. Returns the number of
// bytes written.
export default async function receiveUpload(req, target, { limit, tooLarge, timeoutMs = 0, flush = false }) {
  const part = `${target}.part`;
  let received = 0;
  const count = new Transform({
    transform(chunk, encoding, done) {
      received += chunk.length;
      done(received > limit ? new HttpError(413, tooLarge) : null, chunk);
    },
  });
  const late = timeoutMs ? setTimeout(() => req.destroy(new HttpError(408, 'That took too long to arrive. Try again.')), timeoutMs) : null;
  try {
    await pipeline(req, count, fs.createWriteStream(part, { mode: 0o600, flush }));
  } catch (err) {
    fs.rmSync(part, { force: true });
    if (err instanceof HttpError) throw err;
    throw HttpError.badRequest('The upload was interrupted. Try again.');
  } finally {
    clearTimeout(late);
  }
  if (!received) {
    fs.rmSync(part, { force: true });
    throw HttpError.badRequest('That file is empty.');
  }
  fs.renameSync(part, target);
  return received;
}
