import config from '../config.js';
import plan from '../services/plan.js';
import scanTreasury from '../billing/scanTreasury.js';
import confirmPayments from '../billing/confirmPayments.js';
import expireInvoices from '../billing/expireInvoices.js';

let running = null;

// Finds payments for open invoices on the treasury, follows them to finality, and closes
// invoices whose window passed. Runs every minute and whenever an admin asks; a call that
// arrives while one is running waits for that one instead of starting a second. Each step runs
// even when the one before it failed, so a scan the node refuses never holds up payments that
// were already found; the first failure is passed on afterwards to be logged.
export default function watchInvoices() {
  if (!config.nox.enabled || !plan.status().enforced) return Promise.resolve();
  if (!running) {
    running = (async () => {
      let failure = null;
      for (const step of [scanTreasury, confirmPayments, expireInvoices]) {
        try {
          await step();
        } catch (err) {
          failure ??= err;
        }
      }
      if (failure) throw failure;
    })().finally(() => {
      running = null;
    });
  }
  return running;
}
