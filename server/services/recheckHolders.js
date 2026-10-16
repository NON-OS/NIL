import sql from '../db/sql.js';
import config from '../config.js';
import sessions from '../auth/sessions.js';
import hub from '../realtime/hub.js';
import holderGate from './holderGate.js';
import holdings from './holdings.js';
import holderStanding from './holderStanding.js';

const HOUR = 3_600_000;

// Checks again the members who came in through the holder door, so one stack of NOX can't let
// several wallets in one after another. Someone who fell below gets the grace period and a
// notice; once it's over they are signed out and can come back by holding enough again.
// `force` checks everyone now (right after a new holder joins) instead of on the schedule.
export default async function recheckHolders({ force = false, now = Date.now() } = {}) {
  const gate = holderGate.get();
  if (!gate.enabled) return;
  const due = now - config.holders.recheckHours * HOUR;
  const members = sql.all("SELECT id FROM users WHERE joined_via = 'holder' AND deactivated = 0 AND (? OR holder_checked_at IS NULL OR holder_checked_at < ?)", force ? 1 : 0, due);
  for (const { id } of members) {
    let held;
    try {
      held = (await holdings(id)).total;
    } catch {
      // the node didn't answer: nobody loses access over that, try again next round
      continue;
    }
    if (holderStanding(id, held, gate.minimum, now).state === 'locked') {
      sessions.revokeAll(id);
      hub.disconnect(id);
    }
  }
}
