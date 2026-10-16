import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';

// Which piece of a private task a ciphertext is, so the server can't move one into another.
export type TaskField = 'title' | 'description' | 'checklist' | 'comment';

const aad = (sealId: string, field: TaskField) => `nil/task/${sealId}/${field}`;

// Encrypts and decrypts one piece of a private task with that task's key. What goes in is the
// author's signed text (see signedText), so the server can't swap in words it made up.
const taskText = {
  context: aad,

  async seal(key: Uint8Array, sealId: string, field: TaskField, payload: string) {
    return b64u.encode(await aesGcm.seal(key, new TextEncoder().encode(payload), utf8ToBytes(aad(sealId, field))));
  },

  async open(key: Uint8Array, sealId: string, field: TaskField, blob: string) {
    return new TextDecoder().decode(await aesGcm.open(key, b64u.decode(blob), utf8ToBytes(aad(sealId, field))));
  },
};

export default taskText;
