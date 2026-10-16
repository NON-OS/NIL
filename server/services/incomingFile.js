import HttpError from '../lib/HttpError.js';
import parseJSON from '../lib/parseJSON.js';
import opaqueFile from '../lib/opaqueFile.js';
import plainFile from '../lib/plainFile.js';
import parseFileSeal from './parseFileSeal.js';

function headerName(value) {
  try {
    return decodeURIComponent(String(value || 'file'));
  } catch {
    return 'file';
  }
}

// What the server keeps about an uploaded file. On an encrypted task the file arrives
// encrypted with its name and type sealed inside, and an upload that would give either away is
// refused rather than quietly stripped. Anywhere else a file keeps the name and type it came with.
export default function incomingFile(headers, task) {
  if (task.private && !task.sealed) throw HttpError.badRequest('This private task gets encrypted the next time its creator or assignee unlocks. Add files after that.');
  const seal = headers['x-sealed'];
  if (Boolean(task.sealed) !== (seal !== undefined)) {
    throw HttpError.badRequest(task.sealed ? 'This task is encrypted, so files on it are encrypted too. Attach them in Nil.' : 'Only files on private tasks are encrypted.');
  }
  if (!task.sealed) return { ...plainFile(headerName(headers['x-filename']), headers['content-type']), sealed: null };

  const opaque = plainFile('', headers['content-type']).mime === opaqueFile.mime;
  if (headers['x-filename'] !== undefined || !opaque) throw HttpError.badRequest('Send a file on a private task encrypted only, without its name or type.');
  const sealed = parseFileSeal(parseJSON(seal, null));
  // encrypted under an older key, the file would be unreadable to whoever holds the new one
  if (sealed.seal !== task.sealed.id) throw new HttpError(409, 'This task got a new key while the file was uploading. Try again.');
  return { ...opaqueFile, sealed };
}
