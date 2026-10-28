// Everything here is either ciphertext or harmless metadata. Plain text never exists on the server.
export default function toDoc(row, wrappedKey, extra = {}) {
  return {
    id: row.id,
    titleCt: row.title_ct,
    version: row.version,
    audience: row.audience,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // live changes name this, so ones sealed under a key the doc has left are turned away
    keyEpoch: row.key_epoch ?? 0,
    wrappedKey,
    ...extra,
  };
}
