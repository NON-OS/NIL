import http from '../api/http';
import ApiError from '../api/ApiError';
import itemKeyWrap from '../lib/crypto/itemKeyWrap';
import folders from './folders';
import folderItemSeal from './folderItemSeal';
import type FolderItem from '../types/FolderItem';
import type SharedFolder from '../types/SharedFolder';

// A shared folder's trash: what's deleted stays there, with everything that went with it, for a
// while before it's gone for good, and can be brought back.
const folderTrash = {
  // Back where it was. If the folder it was in is in the trash too, it comes back at the top of
  // the shared folder instead, its details signed again for that place.
  async restore(folder: SharedFolder, item: FolderItem) {
    try {
      await http.post(`/folders/${folder.id}/items/${item.id}/restore`, {});
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409) || item.locked) throw err;
      const folderKey = folders.writable(folder, 'restore it');
      const key = await itemKeyWrap.unwrap(folderKey, folder.id, item.id, item.keyWrap);
      try {
        const metaCt = await folderItemSeal.seal(folderKey, item, key, item.name, folderItemSeal.facts(item, key, { parent: null }));
        await http.post(`/folders/${folder.id}/items/${item.id}/restore`, { parentId: null, metaCt, keyRev: folder.keyRev });
      } finally {
        key.fill(0);
      }
    }
  },

  // Gone for good, with its files. This can't be undone.
  forever: (folder: SharedFolder, item: FolderItem) => http.del(`/folders/${folder.id}/trash/${item.id}`),
};

export default folderTrash;
