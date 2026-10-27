import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';
import itemSubkey from './itemSubkey';

// Names the folder and the item, so sealed details only open as that item's, in that folder.
const aad = (folderId: string, itemId: string) => utf8ToBytes(`nil/folder/${folderId}/item/${itemId}/meta`);

// Encrypts and decrypts the signed details of a file or subfolder (its name, type, size, place
// and the rest of itemFacts) under a key derived from the item's own key.
const itemMeta = {
  async seal(itemKey: Uint8Array, folderId: string, itemId: string, payload: string) {
    return b64u.encode(await aesGcm.seal(itemSubkey(itemKey, 'meta'), utf8ToBytes(payload), aad(folderId, itemId)));
  },

  async open(itemKey: Uint8Array, folderId: string, itemId: string, blob: string) {
    return new TextDecoder().decode(await aesGcm.open(itemSubkey(itemKey, 'meta'), b64u.decode(blob), aad(folderId, itemId)));
  },
};

export default itemMeta;
