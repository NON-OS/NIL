import fs from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import HttpError from './HttpError.js';

// Streams a request body to disk, so a file never sits in memory whole. It's written next to
// `target` under a .part suffix and renamed into place once complete; a body over `limit`
// bytes is cut off and what arrived of it removed. Returns the number of bytes written.
export default async function receiveUpload(req, target, { limit, tooLarge }) {
  const part = `${target}.part`;
  let received = 0;
  const count = new Transform({
    transform(chunk, encoding, done) {
      received += chunk.length;
      done(received > limit ? new HttpError(413, tooLarge) : null, chunk);
    },
  });
  try {
    await pipeline(req, count, fs.createWriteStream(part, { mode: 0o600 }));
  } catch (err) {
    fs.rmSync(part, { force: true });
    if (err instanceof HttpError) throw err;
    throw HttpError.badRequest('The upload was interrupted. Try again.');
  }
  if (!received) {
    fs.rmSync(part, { force: true });
    throw HttpError.badRequest('That file is empty.');
  }
  fs.renameSync(part, target);
  return received;
}
