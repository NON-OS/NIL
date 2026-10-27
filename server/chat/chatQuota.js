import sql from '../db/sql.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import units from '../config/units.js';
import storedBytes from '../services/storedBytes.js';
import storageFull from '../services/storageFull.js';

const held = { people: new Map(), total: 0 };

function hold(userId, bytes) {
  held.people.set(userId, (held.people.get(userId) ?? 0) + bytes);
  held.total += bytes;
  if (!held.people.get(userId)) held.people.delete(userId);
}

const sum = (text, ...params) => sql.get(text, ...params).n;

// Chat files count toward the same room as task files: one person's share
// (UPLOAD_QUOTA_PER_MEMBER_MB) and the whole workspace's storage (UPLOAD_QUOTA_MB). Like a task
// file, an upload holds its size until it's stored or given up. Returns the release function.
export default function chatQuota(user, bytes) {
  const { memberQuotaBytes, workspaceQuotaBytes } = config.uploads;
  const mine = sum('SELECT COALESCE(SUM(size), 0) AS n FROM attachments WHERE uploader_id = ?', user.id) + sum('SELECT COALESCE(SUM(size), 0) AS n FROM chat_files WHERE uploader_id = ?', user.id);
  if (memberQuotaBytes && mine + (held.people.get(user.id) ?? 0) + bytes > memberQuotaBytes) {
    throw new HttpError(413, `You’ve used the ${Math.round(memberQuotaBytes / units.MB)} MB of file space you have on this server. Remove files you no longer need, or ask whoever runs the server for more.`);
  }
  const chatFiles = sum('SELECT COALESCE(SUM(size), 0) AS n FROM chat_files');
  if (workspaceQuotaBytes && storedBytes({ fresh: true }).total + chatFiles + held.total + bytes > workspaceQuotaBytes) throw new HttpError(413, storageFull(workspaceQuotaBytes));
  hold(user.id, bytes);
  let holding = true;
  return () => {
    if (holding) hold(user.id, -bytes);
    holding = false;
  };
}
