import config from '../config.js';
import publishVerification from '../services/publishVerification.js';

// Whether the server could verify its chain reads lately, for the admins' notice and /healthz.
// Only times and a reason are kept, never what was read. In enforce mode a verifier that was
// unavailable is fine again with its next proven answer; in shadow mode being unavailable makes
// nothing wait, so it isn't shown at all. A node caught in a false answer ("mismatch") stays on
// the notice for NOX_VERIFY_MISMATCH_HOURS, since the next true answer doesn't undo the lie. A
// block too old to prove says nothing about either, so it leaves this alone; the payment it
// belongs to says so itself.
let lastProven = 0;
let lastFailure = 0;
let lastMismatch = 0;
let reason = null;

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

const verifyHealth = {
  proven() {
    const before = verifyHealth.report();
    lastProven = Date.now();
    verifyHealth.changed(before);
  },

  failed(why) {
    if (why === 'out-of-range') return;
    const before = verifyHealth.report();
    lastFailure = Date.now();
    reason = why;
    if (why === 'mismatch') lastMismatch = lastFailure;
    verifyHealth.changed(before);
  },

  changed(before) {
    const now = verifyHealth.report();
    if (now.ok !== before.ok || now.reason !== before.reason) publishVerification(now);
  },

  report(now = Date.now()) {
    const { mode, required } = config.verification;
    if (mode === 'off') return { mode, required: false, ok: true, reason: null, since: null, mismatchAt: null };
    const unavailable = required && lastFailure > lastProven && reason !== 'mismatch';
    const mismatch = lastMismatch && now - lastMismatch < config.verification.mismatchNoticeMs ? lastMismatch : 0;
    return {
      mode,
      required,
      ok: !unavailable && !mismatch,
      reason: unavailable ? reason : mismatch ? 'mismatch' : null,
      since: unavailable ? iso(lastFailure) : null,
      mismatchAt: iso(mismatch),
      lastProven: iso(lastProven),
    };
  },
};

export default verifyHealth;
