import config from '../config.js';
import plan from '../services/plan.js';
import billingState from '../billing/billingState.js';
import scanTreasury from '../billing/scanTreasury.js';
import reconcileTreasury from '../billing/reconcileTreasury.js';
import confirmPayments from '../billing/confirmPayments.js';
import settleOpen from '../billing/settleOpen.js';
import expireInvoices from '../billing/expireInvoices.js';

let running = null;

// Finds payments for open invoices on the treasury, now and then goes over the recent past again,
// follows payments to finality, settles invoices they cover, and closes invoices whose window
// passed. Runs every minute and whenever an admin asks; a call that arrives while one is running
// waits for that one instead of starting a second. Each step runs even when the one before it
// failed, so a scan the node refuses never holds up payments that were already found; the first
// failure is passed on afterwards to be logged. Every step can be run again from the start, so a
// restart anywhere in between loses nothing. When a whole pass gets through, its time is kept for
// the billing watchdog.
export default function watchInvoices() {
  if (!config.nox.enabled || !plan.status().enforced) return Promise.resolve();
  if (!running) {
    running = (async () => {
      let failure = null;
      for (const step of [scanTreasury, reconcileTreasury, confirmPayments, settleOpen, expireInvoices]) {
        try {
          await step();
        } catch (err) {
          failure ??= err;
        }
      }
      if (failure) throw failure;
      billingState.set('watchedAt', Date.now());
    })().finally(() => {
      running = null;
    });
  }
  return running;
}
