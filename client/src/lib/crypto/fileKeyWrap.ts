import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';

// The field name keeps a wrapped file key apart from every other ciphertext under the task's
// key, and naming the current seal and the file ties it to both.
const aad = (sealId: string, fileId: string) => utf8ToBytes(`nil/task/${sealId}/file-key/${fileId}`);

// A file's own key, wrapped under its task's key. When the task gets a fresh key, these 80
// characters per file are what gets re-wrapped; the files themselves stay as they are.
const fileKeyWrap = {
  async wrap(taskKey: Uint8Array, sealId: string, fileId: string, fileKey: Uint8Array) {
    return b64u.encode(await aesGcm.seal(taskKey, fileKey, aad(sealId, fileId)));
  },

  unwrap: (taskKey: Uint8Array, sealId: string, fileId: string, wrapped: string) => aesGcm.open(taskKey, b64u.decode(wrapped), aad(sealId, fileId)),
};

export default fileKeyWrap;
