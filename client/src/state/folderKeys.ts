import store from './store';

// Shared folder keys opened in this tab, by folder id. Memory only, like the keyring's doc keys,
// and wiped the moment the keys lock: on lock, sign-out or reload.
const keys = new Map<string, Uint8Array>();
let unlocked = false;

store.subscribe(() => {
  const now = store.get().docsUnlocked;
  if (unlocked && !now) {
    for (const key of keys.values()) key.fill(0);
    keys.clear();
  }
  unlocked = now;
});

const folderKeys = {
  get: (folderId: string) => keys.get(folderId),
  remember: (folderId: string, key: Uint8Array) => void keys.set(folderId, key),
  forget: (folderId: string) => void keys.delete(folderId),
};

export default folderKeys;
