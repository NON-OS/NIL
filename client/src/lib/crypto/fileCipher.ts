import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';

// Which part of a file a ciphertext is: its contents, or its name and type.
export type FilePart = 'bytes' | 'meta';

// Names the task seal the file was encrypted under and the file's own seal id, so a ciphertext
// only opens as the part of the file, and the file, it was made for. The seal stays the one
// from upload when the task gets a fresh key later; only the file's wrapped key moves.
const aad = (sealId: string, fileId: string, part: FilePart) => utf8ToBytes(`nil/task/${sealId}/file/${fileId}/${part}`);

// Encrypts and decrypts a file on a private task with the file's own key.
const fileCipher = {
  // what AES-GCM adds to every ciphertext: the 12-byte IV in front and the 16-byte tag behind
  overhead: 28,
  seal: (key: Uint8Array, sealId: string, fileId: string, part: FilePart, data: Uint8Array) => aesGcm.seal(key, data, aad(sealId, fileId, part)),
  open: (key: Uint8Array, sealId: string, fileId: string, part: FilePart, blob: Uint8Array) => aesGcm.open(key, blob, aad(sealId, fileId, part)),
};

export default fileCipher;
