import sql from '../db/sql.js';
import config from '../config.js';
import verifyPayment from '../services/verifyPayment.js';

let running = false;

// Runs every minute: pending payments get re-checked until they have enough confirmations,
// fail, or time out. One run at a time so a slow node can't pile up overlapping checks.
export default async function checkPayments() {
  if (running || !config.nox.enabled) return;
  running = true;
  try {
    for (const { id } of sql.all("SELECT id FROM payments WHERE status = 'pending' ORDER BY created_at")) {
      await verifyPayment(id).catch(() => {});
    }
  } finally {
    running = false;
  }
}
