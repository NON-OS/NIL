// A payment's plain state: sent (not in a block yet), confirming (in a block that isn't final),
// paid, underpaid or overpaid (against the exact amount Nil asked for), failed, or cancelled.
function stateOf(row) {
  if (row.status === 'pending') return row.block_number ? 'confirming' : 'sent';
  if (row.status !== 'confirmed') return row.status;
  if (!row.expected) return 'paid';
  const [amount, expected] = [BigInt(row.amount) + BigInt(row.token_fee ?? '0'), BigInt(row.expected)];
  return amount < expected ? 'underpaid' : amount > expected ? 'overpaid' : 'paid';
}

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
    // what arrived once confirmed; what was asked for until then
    amount: row.amount,
    // what the token kept as a transfer fee, when it keeps one
    fee: row.token_fee && row.token_fee !== '0' ? row.token_fee : null,
    expected: row.expected ?? null,
    token: row.token,
    txHash: row.tx_hash,
    status: row.status,
    state: stateOf(row),
    problem: row.problem,
    blockNumber: row.block_number,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    cancelledAt: row.cancelled_at ?? null,
    // private payouts: whether the chain carries the announcement that lets the payee find it alone
    stealth: Boolean(row.stealth_ephemeral),
    announced: Boolean(row.announced_at),
    // already public once announced; the payer needs them to announce a payout that wasn't
    ephemeralPublicKey: row.stealth_ephemeral ?? null,
    viewTag: row.stealth_view_tag ?? null,
  };
}
