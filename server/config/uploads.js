import envNumber from '../lib/envNumber.js';
import units from './units.js';

// Files attached to tasks. MAX_UPLOAD_MB caps one file; these cap how many files one person can
// send in an hour, and how much one person and the whole workspace can keep. Guests are people
// from outside the team, bounty applicants among them, so they get less room. 0 turns a quota off.
export default Object.freeze({
  perHour: envNumber('UPLOADS_PER_HOUR', 120, { min: 1 }),
  memberQuotaBytes: envNumber('UPLOAD_QUOTA_PER_MEMBER_MB', 2048) * units.MB,
  guestQuotaBytes: envNumber('UPLOAD_QUOTA_PER_GUEST_MB', 100) * units.MB,
  workspaceQuotaBytes: envNumber('UPLOAD_QUOTA_MB', 20480) * units.MB,
});
