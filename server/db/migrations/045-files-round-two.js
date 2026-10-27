// Files, round two. Taking someone out of a shared folder now encrypts every file in it again
// under a fresh key, in the browsers of the people who stay, so a key the person kept opens
// nothing the server still holds:
//
// - folders.reseal_rev is the folder key from which every item must have a key of its own made
//   after it; folder_items.key_rev is the folder key an item's own key was made under. An item
//   with key_rev below reseal_rev is still waiting. Folders that already lost a reader before this
//   release start out waiting too, every item in them.
// - reseal_by and reseal_until let one browser take a few waiting items at a time, so two people
//   opening the folder don't both encrypt the same large file.
// - sealed_blobs.replaces names the blob a fresh copy stands in for until it's swapped in; a doc's
//   blobs carry reseal = 1 while they wait for theirs.
//
// Each file with more than one chunk gets a list of its chunks' hashes, a small sealed blob of its
// own (hashes_id), so a reader can check every chunk as it arrives instead of only at the end.
//
// And deleting something in a folder puts it in the folder's trash first: deleted_at, who deleted
// it, and trash_root, the item that was deleted, on it and on everything that went with it, so a
// restore brings back exactly that.
const filesRoundTwo = `
  ALTER TABLE folders ADD COLUMN reseal_rev INTEGER NOT NULL DEFAULT 0;
  UPDATE folders SET reseal_rev = key_rev WHERE key_rev > 1;

  ALTER TABLE folder_items ADD COLUMN key_rev INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE folder_items ADD COLUMN hashes_id TEXT REFERENCES sealed_blobs(id);
  ALTER TABLE folder_items ADD COLUMN reseal_by TEXT REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE folder_items ADD COLUMN reseal_until INTEGER;
  CREATE INDEX folder_items_hashes ON folder_items(hashes_id) WHERE hashes_id IS NOT NULL;
  CREATE INDEX folder_items_reseal_by ON folder_items(reseal_by) WHERE reseal_by IS NOT NULL;

  ALTER TABLE folder_items ADD COLUMN deleted_at INTEGER;
  ALTER TABLE folder_items ADD COLUMN deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE folder_items ADD COLUMN trash_root TEXT;
  CREATE INDEX folder_items_deleted_by ON folder_items(deleted_by) WHERE deleted_by IS NOT NULL;
  CREATE INDEX folder_items_trash_root ON folder_items(trash_root) WHERE trash_root IS NOT NULL;
  CREATE INDEX folder_items_trashed ON folder_items(deleted_at) WHERE deleted_at IS NOT NULL;

  ALTER TABLE sealed_blobs ADD COLUMN replaces TEXT;
  ALTER TABLE sealed_blobs ADD COLUMN reseal INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX sealed_blobs_replaces ON sealed_blobs(replaces) WHERE replaces IS NOT NULL;
`;

export default filesRoundTwo;
