import sql from '../db/sql.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import utcDay from '../aiCredits/utcDay.js';

// The daily allowance for signed-in AI requests, counted per person and per UTC day like the
// anonymous slots, and kept only for that day. It's separate from the slots, which the server
// can't tie to anyone.
const signedAllowance = {
  spend(userId) {
    const day = utcDay();
    sql.tx(() => {
      signedAllowance.prune();
      sql.run('INSERT INTO ai_signed_usage (user_id, day, requests) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET requests = requests + 1', userId, day);
      const { requests } = sql.get('SELECT requests FROM ai_signed_usage WHERE user_id = ? AND day = ?', userId, day);
      if (requests > config.ai.perDay) throw new HttpError(429, 'You’ve used today’s AI requests. They renew at midnight UTC.');
    });
  },

  prune: () => sql.run('DELETE FROM ai_signed_usage WHERE day < ?', utcDay()),
};

export default signedAllowance;
