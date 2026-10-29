import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';
import itemSubkey from './itemSubkey';

// Names the folder and the item, so sealed details only open as that item's, in that folder.
const aad = (folderId: string, itemId: string, bound: boolean) => utf8ToBytes(`nil/folder/${folderId}/item/${itemId}/meta${bound ? '/v2' : ''}`);

// Encrypts and decrypts the signed details of a file or subfolder (its name, type, size, place
// and the rest of itemFacts) under a key derived from the item's own key and the folder key, so
// they open only for whoever holds the folder's current key. When the folder gets a new key its
// browser encrypts every item's details again. Details from before that, under the item's key
// alone, still open where the folder's signed name allows them.
const itemMeta = {
  async seal(itemKey: Uint8Array, folderKey: Uint8Array, folderId: string, itemId: string, payload: string) {
    return b64u.encode(await aesGcm.seal(itemSubkey(itemKey, 'meta', folderKey), utf8ToBytes(payload), aad(folderId, itemId, true)));
  },

  // The details and whether they were bound to the folder key. `older` lets format 1 through.
  async open(itemKey: Uint8Array, folderKey: Uint8Array, folderId: string, itemId: string, blob: string, { older = false } = {}) {
    const sealed = b64u.decode(blob);
    try {
      return { payload: new TextDecoder().decode(await aesGcm.open(itemSubkey(itemKey, 'meta', folderKey), sealed, aad(folderId, itemId, true))), bound: true };
    } catch (err) {
      if (!older) throw err;
      return { payload: new TextDecoder().decode(await aesGcm.open(itemSubkey(itemKey, 'meta'), sealed, aad(folderId, itemId, false))), bound: false };
    }
  },
};

export default itemMeta;
