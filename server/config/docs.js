import envNumber from '../lib/envNumber.js';
import units from './units.js';

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
  // what a doc's waiting updates may add up to, and what one person may send a minute, in bytes
  pendingBytes: envNumber('DOC_PENDING_MB', 16, { min: 1 }) * units.MB,
  updateBytesPerMinute: envNumber('DOC_UPDATE_MB_PER_MINUTE', 16, { min: 1 }) * units.MB,
  // how much of the waiting updates one answer carries; the browser asks for the rest
  updatesPageChars: envNumber('DOC_UPDATES_PAGE_KB', 4096, { min: 64 }) * 1024,
  // mentions one person may send an hour, each a notice in someone's inbox
  mentionsPerHour: envNumber('DOC_MENTIONS_PER_HOUR', 120, { min: 1 }),
  // updates up to this size travel with the live event; bigger ones are fetched by whoever needs them
  liveInlineChars: envNumber('DOC_LIVE_INLINE_KB', 16, { min: 1 }) * 1024,
  // characters of ciphertext in a doc's title, which is signed with everyone it's for, and in its
  // body; a save's request may carry both
  titleMaxChars: envNumber('DOC_TITLE_MAX_KB', 160, { min: 4 }) * 1024,
  bodyMaxChars: envNumber('DOC_BODY_MAX_MB', 6, { min: 1 }) * units.MB,
  // versions kept in a doc's history, spaced out further the older they get
  revisions: envNumber('DOC_REVISIONS', 100, { min: 10 }),
  // pictures and files one version may say it uses; a version naming more keeps all of the doc's
  blobRefsMax: envNumber('DOC_BLOB_REFS_MAX', 2000, { min: 10 }),
  // how long a picture or file taken out of a doc stays, in case changes made offline still use it
  blobGraceMs: envNumber('DOC_BLOB_GRACE_DAYS', 7, { min: 1 }) * 24 * units.HOUR,
});
