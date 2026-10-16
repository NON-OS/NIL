import hub from '../realtime/hub.js';
import plan from '../services/plan.js';
import guestScope from '../services/guestScope.js';

// Tells every open app that the plan changed. Guests only ever learn whether tools are unlocked.
export default function publishPlan() {
  const status = plan.status();
  const full = { type: 'plan', plan: status };
  const slim = { type: 'plan', plan: { unlocked: status.unlocked } };
  hub.broadcast((viewer) => (guestScope.of(viewer.id) ? slim : full));
}
