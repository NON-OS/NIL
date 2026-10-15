// Wallet addresses and last-seen times are only shown to admins and to the person themselves.
export default function toUser(row, viewer) {
  if (!row) return null;
  const privileged = viewer?.isAdmin || viewer?.id === row.id;
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    role: row.role,
    color: row.color,
    deactivated: !!row.deactivated,
    createdAt: row.created_at,
    address: privileged ? row.address ?? null : null,
    lastSeenAt: privileged ? row.last_seen_at : null,
    joinedVia: privileged ? row.joined_via : null,
  };
}
