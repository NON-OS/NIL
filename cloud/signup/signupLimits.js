import HttpError from '../lib/HttpError.js';
import createLimiter from './createLimiter.js';
import ipKey from './ipKey.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Every in-memory limit on sign-up. Each step counts against the visitor's own network (an IPv4
// address or an IPv6 /56) and, more loosely, against the block around it (/24 or /48), so neither
// rotating addresses inside one allocation nor one busy block can use up what others need.
// There is no budget shared by everyone: past the daily cap, sign-ups wait for approval instead.
export default function signupLimits(rules, now) {
  const limiter = (windowMs, max) => createLimiter({ windowMs, max, now });
  const names = limiter(MINUTE, rules.nameChecksPerIp);
  const challenges = [limiter(15 * MINUTE, rules.challengesPerIp), limiter(15 * MINUTE, rules.challengesPerBlock)];
  const signups = [limiter(DAY, rules.perIpPerDay), limiter(DAY, rules.perBlockPerDay), limiter(HOUR, rules.perBlockPerHour)];

  // nothing is counted unless every limit allows the attempt, so a refusal costs no budget
  function all(steps, ip) {
    const keys = { own: ipKey(ip), block: ipKey(ip, { wide: true }) };
    for (const [l, scope, message] of steps) {
      const result = l.check(keys[scope]);
      if (!result.ok) throw HttpError.tooMany(message, result.retryAfterSec);
    }
    for (const [l, scope] of steps) l.hit(keys[scope]);
  }

  return {
    nameCheck: (ip) => all([[names, 'own', 'Too many lookups. Wait a minute and try again.']], ip),

    challenge: (ip) =>
      all(
        [
          [challenges[0], 'own', 'Too many attempts. Wait a few minutes and try again.'],
          [challenges[1], 'block', 'Too many attempts from your network. Wait a few minutes and try again.'],
        ],
        ip,
      ),

    // counted only for a real, signed attempt, so mistyping a name doesn't use up the day
    signup: (ip) =>
      all(
        [
          [signups[0], 'own', 'Enough workspaces have been created from your network today. Please try again tomorrow.'],
          [signups[1], 'block', 'Enough workspaces have been created from your network today. Please try again tomorrow.'],
          [signups[2], 'block', 'Many workspaces are being created from your network right now. Please try again in an hour.'],
        ],
        ip,
      ),
  };
}
