import sql from '../db/sql.js';
import config from '../config.js';
import treasury from './treasury.js';
import toPayment from '../mappers/toPayment.js';

// Promised, owed and paid per person and token. Admins see everyone. Members see only their
// own rows and payments, because a transaction hash reveals the receiving wallet.
export default function bountyOverview(viewer) {
  const totals = new Map();
  const of = (userId, token) => {
    const key = `${userId}|${token}`;
    if (!totals.has(key)) totals.set(key, { userId, token, promised: 0n, owed: 0n, paid: 0n });
    return totals.get(key);
  };

  const open = sql.all("SELECT assignee_id, status, bounty, bounty_token FROM tasks WHERE bounty IS NOT NULL AND assignee_id IS NOT NULL AND deleted_at IS NULL AND status != 'canceled' AND (bounty_state IS NULL OR bounty_state != 'paid')");
  for (const t of open) of(t.assignee_id, t.bounty_token || config.nox.symbol)[t.status === 'done' ? 'owed' : 'promised'] += BigInt(t.bounty);
  for (const p of sql.all("SELECT payee_id, amount, token FROM payments WHERE status = 'confirmed' AND payee_id IS NOT NULL")) of(p.payee_id, p.token).paid += BigInt(p.amount);

  const payments = viewer.isAdmin
    ? sql.all('SELECT * FROM payments ORDER BY created_at DESC LIMIT 500')
    : sql.all('SELECT * FROM payments WHERE payee_id = ? ORDER BY created_at DESC LIMIT 500', viewer.id);

  return {
    people: [...totals.values()]
      .filter((t) => viewer.isAdmin || t.userId === viewer.id)
      .map((t) => ({ userId: t.userId, token: t.token, promised: String(t.promised), owed: String(t.owed), paid: String(t.paid) })),
    payments: payments.map(toPayment),
    treasury: viewer.isAdmin ? treasury.get() : [],
  };
}
