// A file or subfolder inside a shared folder: where it sits, its key wrapped under the folder key,
// its sealed details and, for a file, its blob, thumbnail and chunk list as stored. `keyRev` is the
// folder key its own key was made under, so a browser can tell it's still waiting to be encrypted
// again after someone was taken out. Things in the folder's trash come too, marked as such.
// `blobs` maps blob ids to their rows.
const blobInfo = (row) => (row ? { id: row.id, chunks: row.chunks, size: row.size, header: row.header } : null);

export default function toFolderItem(row, blobs) {
  return {
    id: row.id,
    folderId: row.folder_id,
    parentId: row.parent_id,
    kind: row.kind,
    keyWrap: row.key_wrap,
    keyRev: row.key_rev,
    metaCt: row.meta_ct,
    blob: blobInfo(row.blob_id && blobs.get(row.blob_id)),
    thumb: blobInfo(row.thumb_id && blobs.get(row.thumb_id)),
    hashes: blobInfo(row.hashes_id && blobs.get(row.hashes_id)),
    // in the folder's trash: when, by whom, and the item whose deletion took it there
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    trashRoot: row.trash_root,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
