import envNumber from '../lib/envNumber.js';
import units from './units.js';

// End-to-end encrypted files: Files, and images and files inside docs. The browser encrypts each
// one in chunks of CHUNK_BYTES (a fixed part of the format, see docs/encryption.md, so it isn't a
// setting) and the server stores the chunks as they come. SEALED_FILE_MAX_MB caps one file; the
// rates cap how many uploads one person starts in an hour and how many chunks they send in a
// minute. An upload nobody added a chunk to for SEALED_UPLOAD_IDLE_MINUTES is thrown away by the
// hourly sweep, as is a finished file no folder took in for SEALED_UPLOAD_STALE_MINUTES. A person
// sends at most SEALED_OPEN_CHUNKS chunks at once, each within SEALED_CHUNK_TIMEOUT_SECONDS. And
// FOLDER_ITEMS_MAX caps the files and folders in one shared folder, so taking someone
// out, which re-wraps every file key in one request, stays one request. Quotas are the ones for
// attachments (config/uploads.js): a person's files and the workspace's storage count both.
const CHUNK_BYTES = units.MB;
// what AES-GCM adds to each chunk: its 16-byte tag (the nonce isn't stored, it's derived)
const TAG_BYTES = 16;

export default Object.freeze({
  chunkBytes: CHUNK_BYTES,
  tagBytes: TAG_BYTES,
  maxFileBytes: envNumber('SEALED_FILE_MAX_MB', 2048, { min: 1 }) * units.MB,
  uploadsPerHour: envNumber('SEALED_UPLOADS_PER_HOUR', 600, { min: 1 }),
  chunksPerMinute: envNumber('SEALED_CHUNKS_PER_MINUTE', 2400, { min: 1 }),
  staleMs: envNumber('SEALED_UPLOAD_STALE_MINUTES', 360, { min: 1 }) * units.MINUTE,
  // an upload no chunk arrived for in this long is given up, and its space let go
  idleMs: envNumber('SEALED_UPLOAD_IDLE_MINUTES', 30, { min: 1 }) * units.MINUTE,
  // chunks one person may be sending at once, and how long one may take to arrive
  openChunks: envNumber('SEALED_OPEN_CHUNKS', 8, { min: 1 }),
  chunkTimeoutMs: envNumber('SEALED_CHUNK_TIMEOUT_SECONDS', 120, { min: 5 }) * units.SECOND,
  folderItemsMax: envNumber('FOLDER_ITEMS_MAX', 5000, { min: 1 }),
});
