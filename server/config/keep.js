import envNumber from '../lib/envNumber.js';

// How long the purge keeps things that have done their job. Dead links and keys: share links
// and sign-in reset links that expired, were used or were revoked, API keys past their expiry,
// and bounty payments started in Nil that were never sent. Copies of the database taken before
// an upgrade, which hold everything retention has erased since. And the voting power of members
// who didn't vote, once a weighted vote has closed: the ballots keep their own weights.
export default Object.freeze({
  expiredDays: envNumber('EXPIRED_DAYS', 30),
  upgradeCopyDays: envNumber('UPGRADE_COPY_DAYS', 7),
  votePowerDays: envNumber('VOTE_POWER_DAYS', 90),
});
