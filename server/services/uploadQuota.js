import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import units from '../config/units.js';
import storedBytes from './storedBytes.js';
import storageFull from './storageFull.js';
import keptBytes from './keptBytes.js';

const GB = 1024 * units.MB;
const MORE = 'Remove files you no longer need, or ask whoever runs the server for more.';

// Bytes held by uploads still on their way, per person and in all.
const held = { people: new Map(), total: 0 };

const size = (bytes) => (bytes >= GB ? `${Math.round(bytes / GB)} GB` : `${Math.round(bytes / units.MB)} MB`);

function hold(userId, bytes) {
  held.people.set(userId, (held.people.get(userId) ?? 0) + bytes);
  held.total += bytes;
  if (!held.people.get(userId)) held.people.delete(userId);
}

// How much files may take up: one person's attachments and encrypted files (UPLOAD_QUOTA_PER_MEMBER_MB,
// or UPLOAD_QUOTA_PER_GUEST_MB for a guest), files in the trash included, and the whole
// workspace's storage (UPLOAD_QUOTA_MB), which counts its database as well. An upload holds its size from before its first byte is read until it's
// stored or given up, so files sent all at once can't slip past a quota together. Returns the
// function that lets go of the hold.
export default function uploadQuota(user, bytes) {
  const { memberQuotaBytes, guestQuotaBytes, workspaceQuotaBytes } = config.uploads;
  const mine = user.role === 'guest' ? guestQuotaBytes : memberQuotaBytes;
  if (mine && keptBytes(user.id) + (held.people.get(user.id) ?? 0) + bytes > mine) {
    throw new HttpError(413, `You’ve used the ${size(mine)} of file space you have on this server. ${MORE}`);
  }
  if (workspaceQuotaBytes && storedBytes({ fresh: true }).total + held.total + bytes > workspaceQuotaBytes) {
    throw new HttpError(413, storageFull(workspaceQuotaBytes));
  }
  hold(user.id, bytes);
  let holding = true;
  return () => {
    if (holding) hold(user.id, -bytes);
    holding = false;
  };
}
