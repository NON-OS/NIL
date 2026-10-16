import sql from '../db/sql.js';
import config from '../config.js';
import nox from '../lib/nox.js';
import notify from './notify.js';

const DAY = 86_400_000;

// Where a member who joined through the holder door stands after a fresh balance check:
//   ok      holds enough
//   grace   fell below; keeps full access until `until`, and was told so the first time
//   locked  stayed below past the grace period
// Holding enough again at any point clears it.
export default function holderStanding(userId, held, minimum, now = Date.now()) {
  const row = sql.get('SELECT holder_below_since FROM users WHERE id = ?', userId);
  if (held >= BigInt(minimum)) {
    sql.run('UPDATE users SET holder_below_since = NULL, holder_checked_at = ? WHERE id = ?', now, userId);
    return { state: 'ok' };
  }
  const since = row?.holder_below_since ?? now;
  const until = since + config.holders.graceDays * DAY;
  sql.run('UPDATE users SET holder_below_since = ?, holder_checked_at = ? WHERE id = ?', since, now, userId);
  if (!row?.holder_below_since) notify([userId], 'holder_low', null, null, { held: String(held), minimum: String(minimum), until, text: `${nox(held)} of ${nox(minimum)}` });
  return { state: until > now ? 'grace' : 'locked', until };
}
