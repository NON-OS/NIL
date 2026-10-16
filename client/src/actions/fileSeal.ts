import { utf8ToBytes } from '@noble/hashes/utils';
import taskKeys, { type TaskKey } from './taskKeys';
import fileCipher from '../lib/crypto/fileCipher';
import fileKeyWrap from '../lib/crypto/fileKeyWrap';
import b64u from '../lib/crypto/b64u';
import fileMeta from '../lib/fileMeta';
import type Attachment from '../types/Attachment';
import type SealedFile from '../types/SealedFile';
import type Task from '../types/Task';

// Runs `use` with a file's own key, unwrapped under its task's current key, and wipes the key
// once it's done. Only task keys are kept in the keyring; a file key lives for one operation.
async function withKey<T>(task: Task, sealed: SealedFile, use: (key: Uint8Array) => Promise<T>) {
  if (!task.sealed) throw new Error('This file’s task isn’t encrypted.');
  const taskKey = await taskKeys.open(task.sealed);
  const key = await fileKeyWrap.unwrap(taskKey.key, taskKey.id, sealed.id, sealed.key);
  try {
    return await use(key);
  } finally {
    key.fill(0);
  }
}

// Files on private tasks. Each is sealed under a fresh key of its own, name and type included,
// and only that key is wrapped under the task's key.
const fileSeal = {
  async seal(taskKey: TaskKey, bytes: Uint8Array, name: string, type: string): Promise<{ sealed: SealedFile; body: Uint8Array }> {
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
    const key = crypto.getRandomValues(new Uint8Array(32));
    try {
      const [body, meta, wrapped] = await Promise.all([
        fileCipher.seal(key, taskKey.id, id, 'bytes', bytes),
        fileCipher.seal(key, taskKey.id, id, 'meta', utf8ToBytes(JSON.stringify(fileMeta(name, type)))),
        fileKeyWrap.wrap(taskKey.key, taskKey.id, id, key),
      ]);
      return { sealed: { id, seal: taskKey.id, meta: b64u.encode(meta), key: wrapped }, body };
    } finally {
      key.fill(0);
    }
  },

  // The file with its real name and type, or marked locked when this tab can't open it.
  async open(task: Task, file: Attachment): Promise<Attachment> {
    const sealed = file.sealed;
    if (!sealed) return file;
    try {
      const meta = await withKey(task, sealed, (key) => fileCipher.open(key, sealed.seal, sealed.id, 'meta', b64u.decode(sealed.meta)));
      const { name, type } = JSON.parse(new TextDecoder().decode(meta));
      const clean = fileMeta(name, type);
      return { ...file, filename: clean.name, mime: clean.type, locked: false };
    } catch {
      return { ...file, locked: true };
    }
  },

  async decrypt(task: Task, sealed: SealedFile, blob: Uint8Array) {
    try {
      return await withKey(task, sealed, (key) => fileCipher.open(key, sealed.seal, sealed.id, 'bytes', blob));
    } catch {
      throw new Error('This file couldn’t be decrypted here.');
    }
  },

  // The same file key, wrapped under the task's fresh key instead of its current one.
  rewrap: (task: Task, sealed: SealedFile, to: TaskKey) => withKey(task, sealed, (key) => fileKeyWrap.wrap(to.key, to.id, sealed.id, key)),
};

export default fileSeal;
