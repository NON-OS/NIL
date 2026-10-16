import sql from '../db/sql.js';
import config from '../config.js';
import treasury from './treasury.js';
import visibleSql from './visibleSql.js';
import toPayment from '../mappers/toPayment.js';

// Promised, owed and paid per person and token. Admins see everyone. Members see only their
// own rows and payments, because a transaction hash reveals the receiving wallet. Promised and
// owed count only tasks the viewer can open: a private task's bounty stays between its creator
// and assignee, admins included. Paid counts every confirmed payment, which is on-chain anyway.
export default function bountyOverview(viewer) {
  const totals = new Map();
  const of = (userId, token) => {
    const key = `${userId}|${token}`;
    if (!totals.has(key)) totals.set(key, { userId, token, promised: 0n, owed: 0n, paid: 0n });
    return totals.get(key);
  };

  const visible = visibleSql(viewer.id, 't');
  const open = sql.all(
    `SELECT t.assignee_id, t.status, t.bounty, t.bounty_token FROM tasks t WHERE t.bounty IS NOT NULL AND t.assignee_id IS NOT NULL AND t.deleted_at IS NULL
     AND t.status != 'canceled' AND (t.bounty_state IS NULL OR t.bounty_state != 'paid') AND ${visible.where}`,
    ...visible.params,
  );
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
