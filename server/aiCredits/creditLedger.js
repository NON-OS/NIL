import sql from '../db/sql.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import utcDay from './utcDay.js';

const DAY = 86_400_000;

// Spent AI credits. A nullifier is stored with its day and nothing else: no time, no address, no
// account. Once its day is over it goes, leaving only the day's total.
const creditLedger = {
  spend({ scope, nullifier, day }) {
    sql.tx(() => {
      // a proof checked just before midnight and spent just after would land after the prune
      // below had dropped yesterday's nullifiers, so a slot already used could be used again
      if (day !== utcDay()) throw new HttpError(409, 'That AI request was made for yesterday. Try again and Nil uses one of today’s credits.');
      creditLedger.prune();
      const { changes } = sql.run('INSERT INTO ai_credit_nullifiers (scope, nullifier, day) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', scope, nullifier, day);
      if (!changes) throw new HttpError(409, 'That AI credit was already used. Try again and Nil picks another of today’s.');
      sql.run('INSERT INTO ai_credit_usage (day, requests) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET requests = requests + 1', day);
    });
  },

  // today's spent nullifiers, so a member's browser can tell which of its slots are left
  spentToday: () => sql.all('SELECT nullifier FROM ai_credit_nullifiers WHERE day = ? ORDER BY nullifier', utcDay()).map((r) => r.nullifier),

  totals: () => sql.all('SELECT day, requests FROM ai_credit_usage ORDER BY day DESC'),

  prune() {
    const today = utcDay();
    sql.run('DELETE FROM ai_credit_nullifiers WHERE day < ?', today);
    sql.run('DELETE FROM ai_credit_usage WHERE day < ?', utcDay(Date.now() - config.aiCredits.usageDays * DAY));
  },
};

export default creditLedger;
