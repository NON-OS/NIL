import sql from '../db/sql.js';
import config from '../config.js';

// Whether resetting this person's sign-in needs a second admin. Only owners are protected: with
// two or more other admins, one asks and another approves. Admins who lost the role within the
// wait still count, so removing one can't switch approval off. With fewer, there's nobody to
// approve, and the reset waits config.signIn.ownerResetWaitMs before its link can be made.
export default function resetApproval(target, now = Date.now()) {
  if (target.role !== 'owner') return { needsApproval: false, waits: false };
  const others = sql.get(
    `SELECT COUNT(*) AS n FROM users WHERE id != ? AND kind = 'human'
       AND ((role IN ('owner', 'admin') AND deactivated = 0) OR admin_until > ?)`,
    target.id,
    now - config.signIn.ownerResetWaitMs,
  ).n;
  return others >= 2 ? { needsApproval: true, waits: false } : { needsApproval: false, waits: true };
}
