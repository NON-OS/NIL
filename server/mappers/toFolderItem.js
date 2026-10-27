// A file or subfolder inside a shared folder: where it sits, its key wrapped under the folder key,
// its sealed details and, for a file, its blob and thumbnail as stored. `blobs` maps blob ids to
// their rows.
const blobInfo = (row) => (row ? { id: row.id, chunks: row.chunks, size: row.size, header: row.header } : null);

export default function toFolderItem(row, blobs) {
  return {
    id: row.id,
    folderId: row.folder_id,
    parentId: row.parent_id,
    kind: row.kind,
    keyWrap: row.key_wrap,
    metaCt: row.meta_ct,
    blob: blobInfo(row.blob_id && blobs.get(row.blob_id)),
    thumb: blobInfo(row.thumb_id && blobs.get(row.thumb_id)),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
