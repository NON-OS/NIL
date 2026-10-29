import config from '../config.js';
import HttpError from '../lib/HttpError.js';

// Chunks on their way in: each place in a blob takes one copy at a time, and each person at most
// SEALED_OPEN_CHUNKS at once, so stalled requests can't pile up temporary files on the disk. A
// browser retrying a chunk whose first try is still hanging is asked to wait a moment.
const busy = new Set();
const open = new Map();
const WAIT_SECONDS = 2;

const chunkSlots = {
  WAIT_SECONDS,

  take(userId, blobId, index) {
    const place = `${blobId}:${index}`;
    if (busy.has(place)) throw new HttpError(429, 'That part of the file is still on its way. Nil tries again in a moment.');
    if ((open.get(userId) ?? 0) >= config.sealedBlobs.openChunks) throw new HttpError(429, 'You’re sending many parts of files at once. Nil tries again in a moment.');
    busy.add(place);
    open.set(userId, (open.get(userId) ?? 0) + 1);
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      busy.delete(place);
      const left = (open.get(userId) ?? 1) - 1;
      if (left > 0) open.set(userId, left);
      else open.delete(userId);
    };
  },
};

export default chunkSlots;
