// One passkey wrap of a member's identity, for its owner's browser only. The salt and the
// credential id let the browser ask that passkey for the same PRF output again.
export default function toPasskey(row) {
  return {
    id: row.id,
    credentialId: row.credential_id,
    salt: row.salt,
    wrapped: row.wrapped,
    label: row.label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}
