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
    // 'pool' when the team pays from its Privacy Pools pool, null for a wallet
    via: row.via ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
