import sql from '../db/sql.js';
import config from '../config.js';
import nox from '../lib/nox.js';
import notify from './notify.js';

const HOUR = 3_600_000;

// Where a member who joined through the holder door stands after a balance check:
//   ok      holds enough, or has held enough again for long enough
//   grace   fell below; keeps full access until `until`, and was told so the first time
//   locked  below, or not back for long enough, once the grace period is over
//
// One stack of NOX passed from wallet to wallet mustn't keep several people in, so only the
// scheduled checks (`scheduled`), which read every member at the same block, can see someone
// holding enough again. Once they've seen it for the recheck window the person is let back in,
// and once they've seen it for the whole grace period the shortfall is over, so the next one
// gets a grace period of its own. A check at sign-in can find someone below, never let them off.
export default function holderStanding(userId, held, minimum, { now = Date.now(), scheduled = false } = {}) {
  const row = sql.get('SELECT holder_below_since, holder_held_since, holder_locked_at FROM users WHERE id = ?', userId);
  const enough = held >= BigInt(minimum);
  const grace = config.holders.graceDays * 24 * HOUR;
  const window = config.holders.recheckHours * HOUR;
  let since = row.holder_below_since;
  if (!since) {
    if (enough) return { state: 'ok' };
    since = now;
    sql.run('UPDATE users SET holder_below_since = ? WHERE id = ?', since, userId);
    notify([userId], 'holder_low', null, null, { held: String(held), minimum: String(minimum), until: since + grace, text: `${nox(held)} of ${nox(minimum)}` });
  }
  const until = since + grace;
  const heldSince = !enough ? null : row.holder_held_since ?? (scheduled ? now : null);
  if (scheduled && heldSince !== null && now - heldSince >= Math.max(grace, window)) {
    sql.run('UPDATE users SET holder_below_since = NULL, holder_held_since = NULL, holder_locked_at = NULL WHERE id = ?', userId);
    return { state: 'ok' };
  }
  const state = heldSince !== null && now - heldSince >= window ? 'ok' : until > now ? 'grace' : 'locked';
  sql.run('UPDATE users SET holder_held_since = ?, holder_locked_at = ? WHERE id = ?', heldSince, state === 'locked' ? row.holder_locked_at ?? now : null, userId);
  return { state, until };
}
