import sql from '../db/sql.js';
import checkpoint from '../db/checkpoint.js';
import inBatches from '../db/inBatches.js';
import deleteSome from '../db/deleteSome.js';
import config from '../config.js';
import retention from '../services/retention.js';
import eraseTasks from '../services/eraseTasks.js';
import sweepComments from '../services/sweepComments.js';
import settleStaged from '../services/settleStaged.js';
import creditLedger from '../aiCredits/creditLedger.js';
import signedAllowance from '../ai/signedAllowance.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let queue = Promise.resolve();

async function sweep(signal) {
  const now = Date.now();
  const policy = retention.get();
  const { batchRows, batchTasks } = config.purge;
  const rows = (step) => inBatches(step, { limit: batchRows, signal });
  const tasks = (where, ...params) =>
    inBatches((limit) => eraseTasks(sql.all(`SELECT id FROM tasks WHERE ${where} LIMIT ?`, ...params, limit).map((r) => r.id), { fold: false }), { limit: batchTasks, signal });

  await tasks('deleted_at IS NOT NULL AND deleted_at < ?', now - config.trashDays * DAY);
  if (policy.doneDays) {
    const cutoff = now - policy.doneDays * DAY;
    await tasks("(status = 'done' AND completed_at < ?) OR (status = 'canceled' AND updated_at < ?)", cutoff, cutoff);
  }
  if (policy.commentDays) {
    const cutoff = now - policy.commentDays * DAY;
    await rows((limit) => sweepComments(cutoff, limit));
  }
  if (policy.activityDays) await rows((limit) => deleteSome('activity', 'created_at < ?', limit, now - policy.activityDays * DAY));

  // copies staged for a seal or an open-up that never went through; one takes seconds, not an hour
  settleStaged({ olderThan: HOUR });

  await rows((limit) => deleteSome('notifications', 'read_at IS NOT NULL AND read_at < ?', limit, now - config.readNotificationDays * DAY));
  await rows((limit) => deleteSome('sessions', 'expires_at < ?', limit, now));
  // unused links go once they expire; links people joined through stay a while longer, so
  // admins can still see who came in with them
  const history = now - config.usedInviteDays * DAY;
  await rows((limit) => deleteSome('invites', '(uses = 0 AND expires_at < ?) OR expires_at < ? OR revoked_at < ?', limit, now, history, history));
  // spent AI credits from days that are over; only each day's total stays
  creditLedger.prune();
  signedAllowance.prune();
  // what the policies above erased mustn't survive in the write-ahead log
  checkpoint();
}

// Runs hourly (JOB_PURGE_SECONDS) and when an admin changes the retention settings. Trash and dead
// sessions always go; the workspace's zero-state policies decide how long finished work, comments
// and history stay. Everything is erased in batches (see inBatches), and runs take turns: one
// asked for while another is going starts when that one ends, with the policy as it is then.
export default function purge(signal) {
  const run = queue.then(() => sweep(signal));
  queue = run.catch(() => {});
  return run;
}
