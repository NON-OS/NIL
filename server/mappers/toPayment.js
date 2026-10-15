export default function toPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    taskRef: row.task_ref,
    payerId: row.payer_id,
    payeeId: row.payee_id,
    to: row.to_address,
    from: row.from_address,
    amount: row.amount,
    token: row.token,
    txHash: row.tx_hash,
    status: row.status,
    problem: row.problem,
    blockNumber: row.block_number,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    // private payouts: whether the chain carries the announcement that lets the payee find it alone
    stealth: Boolean(row.stealth_ephemeral),
    announced: Boolean(row.announced_at),
    // already public once announced; the payer needs them to announce a payout that wasn't
    ephemeralPublicKey: row.stealth_ephemeral ?? null,
    viewTag: row.stealth_view_tag ?? null,
  };
}
