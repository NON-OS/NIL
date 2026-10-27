import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';

// Which folder and which version a name's ciphertext is, as its additional data, so the server
// can't give one folder another's name or pass an old name off under a newer version.
const place = (folderId: string, version: number) => utf8ToBytes(`nil/folder/${folderId}/name/v${version}`);

// Encrypts and decrypts a shared folder's signed name with the folder key.
const folderName = {
  async seal(folderKey: Uint8Array, folderId: string, version: number, payload: string) {
    return b64u.encode(await aesGcm.seal(folderKey, utf8ToBytes(payload), place(folderId, version)));
  },

  async open(folderKey: Uint8Array, folderId: string, version: number, blob: string) {
    return new TextDecoder().decode(await aesGcm.open(folderKey, b64u.decode(blob), place(folderId, version)));
  },
};

export default folderName;
