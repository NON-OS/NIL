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
  };
}
