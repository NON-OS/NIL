import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';

// Names the folder and the item, so a wrapped key only opens as that item's key in that folder.
const aad = (folderId: string, itemId: string) => utf8ToBytes(`nil/folder/${folderId}/item-key/${itemId}`);

// A file's or subfolder's own key, wrapped under its shared folder's key. When the folder gets a
// fresh key, these 80 characters per item are all that's re-wrapped; files stay as they are.
const itemKeyWrap = {
  async wrap(folderKey: Uint8Array, folderId: string, itemId: string, itemKey: Uint8Array) {
    return b64u.encode(await aesGcm.seal(folderKey, itemKey, aad(folderId, itemId)));
  },

  unwrap: (folderKey: Uint8Array, folderId: string, itemId: string, wrapped: string) => aesGcm.open(folderKey, b64u.decode(wrapped), aad(folderId, itemId)),
};

export default itemKeyWrap;
