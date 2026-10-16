// A payment intent as the payer's browser needs it: where to send, exactly how much, by when.
export default function toIntent(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    to: row.to_address,
    token: row.token,
    amount: row.amount,
    stealth: Boolean(row.stealth_ephemeral),
    ephemeralPublicKey: row.stealth_ephemeral,
    viewTag: row.stealth_view_tag,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
