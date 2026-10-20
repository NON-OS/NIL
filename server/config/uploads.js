import envNumber from '../lib/envNumber.js';
import units from './units.js';

// Files attached to tasks. MAX_UPLOAD_MB caps one file; these cap how many files one person can
// send in an hour, and how much one person can keep. Guests are people from outside the team,
// bounty applicants among them, so they get less room. UPLOAD_QUOTA_MB is the whole workspace's
// storage: its files and its database together, since docs and comments fill a disk as surely
// as files do. 0 turns a quota off.
export default Object.freeze({
  perHour: envNumber('UPLOADS_PER_HOUR', 120, { min: 1 }),
  // docs saved and comments written per person a minute; typing autosaves well below this
  writesPerMinute: envNumber('CONTENT_WRITES_PER_MINUTE', 120, { min: 1 }),
  // how long a measurement of the storage in use is reused before measuring again
  storageCheckSeconds: envNumber('STORAGE_CHECK_SECONDS', 10, { min: 1 }),
  memberQuotaBytes: envNumber('UPLOAD_QUOTA_PER_MEMBER_MB', 2048) * units.MB,
  guestQuotaBytes: envNumber('UPLOAD_QUOTA_PER_GUEST_MB', 100) * units.MB,
  workspaceQuotaBytes: envNumber('UPLOAD_QUOTA_MB', 20480) * units.MB,
});
