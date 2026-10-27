import envNumber from '../lib/envNumber.js';

// Live editing. Every change someone makes to a doc goes out as one encrypted update; browsers
// fold the updates into a new version every few seconds, and the server keeps only the updates
// that came after the newest version. These cap what one update and one doc can hold, so a
// script can't fill the disk between versions.
export default Object.freeze({
  // characters of ciphertext in one update; a big paste is one update
  updateMaxChars: envNumber('DOC_UPDATE_MAX_KB', 512, { min: 16 }) * 1024,
  // updates a doc can collect before the server asks for a new version first
  pendingUpdates: envNumber('DOC_PENDING_UPDATES', 1000, { min: 50 }),
  // updates per person a minute; typing sends a few a second at most
  updatesPerMinute: envNumber('DOC_UPDATES_PER_MINUTE', 600, { min: 30 }),
  // versions kept in a doc's history, spaced out further the older they get
  revisions: envNumber('DOC_REVISIONS', 100, { min: 10 }),
});
