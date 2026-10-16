import config from '../config.js';
import plan from '../services/plan.js';
import scanTreasury from '../billing/scanTreasury.js';
import confirmPayments from '../billing/confirmPayments.js';
import expireInvoices from '../billing/expireInvoices.js';

let running = null;

// Finds payments for open invoices on the treasury, follows them to finality, and closes
// invoices whose window passed. Runs every minute and whenever an admin asks; a call that
// arrives while one is running waits for that one instead of starting a second.
export default function watchInvoices() {
  if (!config.nox.enabled || !plan.status().enforced) return Promise.resolve();
  if (!running) {
    running = (async () => {
      try {
        await scanTreasury();
        await confirmPayments();
        expireInvoices();
      } finally {
        running = null;
      }
    })();
  }
  return running;
}
