export default function toWorkspace(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    owner: row.owner,
    state: row.state,
    image: row.image,
    plan: row.plan,
    volume: row.volume,
    setupToken: row.setup_token,
    invoiceSlot: row.invoice_slot ?? null,
    claimedAt: row.claimed_at,
    checkpointImage: row.checkpoint_image,
    checkpointAt: row.checkpoint_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    suspendedAt: row.suspended_at,
    suspendReason: row.suspend_reason,
    deleteAfter: row.delete_after,
    deletedAt: row.deleted_at,
    lastHealthyAt: row.last_healthy_at,
  };
}
