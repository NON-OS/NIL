// Wallet addresses and last-seen times are only shown to admins and to the person themselves.
export default function toUser(row, viewer) {
  if (!row) return null;
  const privileged = viewer?.isAdmin || viewer?.id === row.id;
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    role: row.role,
    // 'agent' for AI teammates set up in Settings → Agents; they never sign in
    kind: row.kind === 'agent' ? 'agent' : 'human',
    color: row.color,
    deactivated: !!row.deactivated,
    createdAt: row.created_at,
    address: privileged ? row.address ?? null : null,
    lastSeenAt: privileged ? row.last_seen_at : null,
    joinedVia: privileged ? row.joined_via : null,
    // where private payouts go; admins need it to pay, nobody else sees it
    stealthMeta: privileged ? row.stealth_meta ?? null : null,
    semaphoreCommitment: privileged ? row.semaphore_commitment ?? null : null,
  };
}
