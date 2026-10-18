import hub from '../realtime/hub.js';

// Tells admins' open apps that chain verification started or stopped working, and why. Nobody
// else is sent it: members see the effect (a payment still waiting), not the plumbing.
export default function publishVerification(report) {
  const event = { type: 'verification', verification: report };
  hub.broadcast((viewer) => (viewer.isAdmin ? event : null));
}
