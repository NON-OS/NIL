import sql from '../db/sql.js';
import config from '../config.js';
import logLimited from '../lib/logLimited.js';
import verifyPayment from '../services/verifyPayment.js';
import checkAnnouncement from '../services/checkAnnouncement.js';
import watchInvoices from './watchInvoices.js';
import checkPerks from './checkPerks.js';

// A check that fails (the node is down, a reply makes no sense) is retried on the next run and
// never holds up the others. It is logged, at most once every few minutes per kind, so an
// outage doesn't flood the log. Payment ids are internal; addresses and hashes stay out of it.
function attempt(kind, check, id) {
  return check(id).catch((err) => logLimited(`payments:${kind}`, 'warn', 'payments', `Couldn’t check ${kind}${id ? ` ${id}` : ''}. It will be retried.`, err));
}

// Runs every minute: pending bounty payments and Nil Pro invoices are followed until they are
// final, fail, or time out, and the scheduled NOX checks (Zero-State Pass Pro, holder
// balances) run when they're due. Stops between payments when the server is shutting down.
export default async function checkPayments(signal) {
  if (!config.nox.enabled) return;
  for (const { id } of sql.all("SELECT id FROM payments WHERE status = 'pending' ORDER BY created_at")) {
    if (signal?.aborted) return;
    await attempt('bounty payment', verifyPayment, id);
  }
  if (signal?.aborted) return;
  await attempt('Nil Pro invoices', watchInvoices);
  const since = Date.now() - config.stealth.announceCheckDays * 86_400_000;
  for (const { id } of sql.all("SELECT id FROM payments WHERE status = 'confirmed' AND stealth_ephemeral IS NOT NULL AND announced_at IS NULL AND announce_tx IS NOT NULL AND created_at > ?", since)) {
    if (signal?.aborted) return;
    await attempt('payout announcement', checkAnnouncement, id);
  }
  if (signal?.aborted) return;
  await attempt('NOX perks', checkPerks);
}
