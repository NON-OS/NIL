import sql from '../db/sql.js';
import config from '../config.js';
import verifyPayment from '../services/verifyPayment.js';
import verifyPlanPayment from '../services/verifyPlanPayment.js';

let running = false;

// Runs every minute: pending bounty and subscription payments get re-checked until they have enough confirmations,
// fail, or time out. One run at a time so a slow node can't pile up overlapping checks.
export default async function checkPayments() {
  if (running || !config.nox.enabled) return;
  running = true;
  try {
    for (const { id } of sql.all("SELECT id FROM payments WHERE status = 'pending' ORDER BY created_at")) {
      await verifyPayment(id).catch(() => {});
    }
    for (const { id } of sql.all("SELECT id FROM plan_payments WHERE status = 'pending' ORDER BY created_at")) {
      await verifyPlanPayment(id).catch(() => {});
    }
  } finally {
    running = false;
  }
}
