import path from 'node:path';
import uploadDir from './uploadDir.js';

// Where one chunk of a sealed blob is kept: in the upload folder, beside attachments, as
// <blob id>_<chunk number>. Blob ids have a fixed length, so no two chunks or files share a name,
// and capsules and the full erase take them along with every other stored file.
export default function blobChunk(blobId, index) {
  return path.join(uploadDir, `${blobId}_${index}`);
}
