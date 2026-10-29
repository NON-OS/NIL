import storage from '../lib/storage';
import keyScope from './keyScope';

// The highest version of each shared folder's name, the highest key of each, and the highest edit
// of each file's details, that this browser has opened and verified, per workspace and account. Ids and numbers only. A
// server that later serves an older one is rolling it back, and the reader is told.
function check(name: string, id: string, n: number): 'ok' | 'rollback' {
  const here = keyScope.slot(name);
  if (!here) return 'ok';
  const seen = storage.get<Record<string, number>>(here, {});
  if ((seen[id] ?? -1) > n) return 'rollback';
  if (seen[id] !== n) storage.set(here, { ...seen, [id]: n });
  return 'ok';
}

const folderVersions = {
  folder: (folderId: string, version: number) => check('folder-versions', folderId, version),
  item: (itemId: string, edit: number) => check('item-edits', itemId, edit),
  // which of a folder's keys, so an older one can't be passed off as the newest
  key: (folderId: string, keyRev: number) => check('folder-keys', folderId, keyRev),
};

export default folderVersions;
