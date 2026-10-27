// A shared folder as its readers get it: the encrypted name, this reader's sealed key and who
// else holds one. Nothing here is plain text about what's inside.
export default function toFolder(row, wrappedKey, readers) {
  return {
    id: row.id,
    nameCt: row.name_ct,
    version: row.version,
    keyRev: row.key_rev,
    audience: row.audience,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    wrappedKey,
    readers,
  };
}
