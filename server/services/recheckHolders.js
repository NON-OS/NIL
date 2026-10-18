import sql from '../db/sql.js';
import config from '../config.js';
import sessions from '../auth/sessions.js';
import hub from '../realtime/hub.js';
import headBlock from '../chain/headBlock.js';
import holderGate from './holderGate.js';
import holdings from './holdings.js';
import holderStanding from './holderStanding.js';
import holderWallets from './holderWallets.js';

const HOUR = 3_600_000;
let running = null;
let again = false;

// One pass over the members who came in through the holder door and are due a check, or all of
// them with `force`. Everyone is read at the same block, so tokens moved during the pass can't
// count for two people. Someone below gets the grace period and a notice; once it's over they
// are signed out, and their access keys stop working while they stay locked.
async function pass({ force, now }) {
  holderWallets.forgetOld(now);
  const gate = holderGate.get();
  if (!gate.enabled) return;
  const due = now - config.holders.recheckHours * HOUR;
  const members = sql.all("SELECT id FROM users WHERE joined_via = 'holder' AND deactivated = 0 AND kind = 'human' AND (? OR holder_checked_at IS NULL OR holder_checked_at < ?)", force ? 1 : 0, due);
  if (!members.length) return;
  let block;
  try {
    block = `0x${(await headBlock()).toString(16)}`;
  } catch {
    // the node didn't answer: nobody loses access over that, try again next round
    return;
  }
  for (const { id } of members) {
    let held;
    try {
      held = (await holdings(id, { block, now })).total;
    } catch {
      continue;
    }
    sql.run('UPDATE users SET holder_checked_at = ? WHERE id = ?', now, id);
    if (holderStanding(id, held, gate.minimum, { now, scheduled: true }).state === 'locked') {
      sessions.revokeAll(id);
      hub.disconnect(id);
    }
  }
}

// Checks the holder door's members again, so one stack of NOX can't keep several wallets in.
// Runs one pass at a time: asking while a pass runs (a burst of joins, each forcing one) waits for
// it and then runs a single forced pass more, however many asked, instead of piling up reads.
export default function recheckHolders({ force = false, now } = {}) {
  if (running) {
    again ||= force;
    return running;
  }
  running = (async () => {
    try {
      await pass({ force, now: now ?? Date.now() });
      while (again) {
        again = false;
        await pass({ force: true, now: Date.now() });
      }
    } finally {
      running = null;
    }
  })();
  return running;
}
