import fs from 'node:fs';
import { pipeline } from 'node:stream';
import HttpError from './HttpError.js';

// Streams a stored file into a response. The file is opened first, so one that's gone or can't
// be opened (out of file handles) answers 404 or 503 instead of throwing outside the request, and
// a client that hangs up mid-download closes the file at once instead of leaving it open.
export default async function sendFile(res, file) {
  let handle;
  try {
    handle = await fs.promises.open(file, 'r');
  } catch (err) {
    if (err.code === 'ENOENT') throw HttpError.notFound('That file');
    throw new HttpError(503, 'The server is busy. Try the download again in a moment.');
  }
  try {
    res.setHeader('Content-Length', (await handle.stat()).size);
  } catch (err) {
    await handle.close();
    throw err;
  }
  pipeline(handle.createReadStream(), res, () => {});
}
