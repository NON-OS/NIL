// End-to-end encrypted files. A sealed blob is a file the browser encrypted in chunks: the server
// keeps its 8-byte header (format version and nonce prefix), how many chunks it has, their sizes,
// and who may fetch it, named by its scope: a doc (anyone holding a key to the doc) or a shared
// folder (anyone holding a key to the folder). The chunks themselves sit in the upload folder as
// files named <blob id>_<chunk number>. An upload in progress has no finished_at.
//
// Shared folders work like docs: a folder key sealed to each reader, a name encrypted and signed
// by whoever last saved it, an audience and a version. Everything inside a top folder, subfolders
// included, is an item with its own key wrapped under the folder key, and its name, type, size
// and place encrypted under its own key and signed. Taking a reader out re-wraps those keys
// (key_rev counts the folder keys), never the files.
const sealedBlobsAndFiles = `
  CREATE TABLE sealed_blobs (
    id TEXT PRIMARY KEY,
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('doc', 'folder')),
    scope_id TEXT NOT NULL,
    uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    header TEXT NOT NULL,
    chunks INTEGER NOT NULL,
    size INTEGER NOT NULL,
    finished_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX sealed_blobs_scope ON sealed_blobs(scope_kind, scope_id);
  CREATE INDEX sealed_blobs_uploader ON sealed_blobs(uploader_id) WHERE uploader_id IS NOT NULL;
  CREATE INDEX sealed_blobs_unfinished ON sealed_blobs(updated_at) WHERE finished_at IS NULL;

  CREATE TABLE sealed_blob_chunks (
    blob_id TEXT NOT NULL REFERENCES sealed_blobs(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    size INTEGER NOT NULL,
    PRIMARY KEY (blob_id, idx)
  );

  CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name_ct TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    key_rev INTEGER NOT NULL DEFAULT 1,
    audience TEXT NOT NULL CHECK (audience IN ('team', 'people')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX folders_created_by ON folders(created_by) WHERE created_by IS NOT NULL;
  CREATE INDEX folders_updated_by ON folders(updated_by) WHERE updated_by IS NOT NULL;

  CREATE TABLE folder_keys (
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wrapped_key TEXT NOT NULL,
    granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (folder_id, user_id)
  );
  CREATE INDEX folder_keys_user ON folder_keys(user_id);
  CREATE INDEX folder_keys_granted_by ON folder_keys(granted_by) WHERE granted_by IS NOT NULL;

  CREATE TABLE folder_items (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES folder_items(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('file', 'folder')),
    blob_id TEXT REFERENCES sealed_blobs(id),
    thumb_id TEXT REFERENCES sealed_blobs(id),
    key_wrap TEXT NOT NULL,
    meta_ct TEXT NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX folder_items_folder ON folder_items(folder_id);
  CREATE INDEX folder_items_parent ON folder_items(parent_id) WHERE parent_id IS NOT NULL;
  CREATE INDEX folder_items_blob ON folder_items(blob_id) WHERE blob_id IS NOT NULL;
  CREATE INDEX folder_items_thumb ON folder_items(thumb_id) WHERE thumb_id IS NOT NULL;
  CREATE INDEX folder_items_created_by ON folder_items(created_by) WHERE created_by IS NOT NULL;
  CREATE INDEX folder_items_updated_by ON folder_items(updated_by) WHERE updated_by IS NOT NULL;
`;

export default sealedBlobsAndFiles;
