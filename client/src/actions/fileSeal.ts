import { utf8ToBytes } from '@noble/hashes/utils';
import store from '../state/store';
import keyring from '../state/keyring';
import taskKeys, { type TaskKey } from './taskKeys';
import keyDirectory from './keyDirectory';
import fileCipher from '../lib/crypto/fileCipher';
import fileKeyWrap from '../lib/crypto/fileKeyWrap';
import fileFacts from '../lib/crypto/fileFacts';
import signedFacts from '../lib/crypto/signedFacts';
import b64u from '../lib/crypto/b64u';
import fileMeta from '../lib/fileMeta';
import type Attachment from '../types/Attachment';
import type SealedFile from '../types/SealedFile';
import type Task from '../types/Task';

const digest = async (bytes: Uint8Array) => b64u.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));

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

// A file's name and type, opened and checked. From format 2 on they're signed by whoever
// attached the file, for this task and this file, with its size and hash; an older file carries
// its name and type alone, which nobody signed.
async function details(task: Task, sealed: SealedFile, key: Uint8Array) {
  const json = new TextDecoder().decode(await fileCipher.open(key, sealed.seal, sealed.id, 'meta', b64u.decode(sealed.meta)));
  const value = JSON.parse(json);
  if (value?.v === undefined) return { ...fileMeta(value?.name, value?.type), size: null, hash: null, olderFormat: true, oldKey: null };
  const { signed, facts } = signedFacts.open(json);
  const f = fileFacts.parse(facts ?? []);
  const statement = { kind: fileFacts.kind, place: fileFacts.place(task.id, sealed.id), facts: fileFacts.list(f) };
  const author = await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k));
  if (!author) throw new Error('Nil can’t confirm who attached this file.');
  return { ...fileMeta(signed.text, f.type), size: f.size, hash: f.hash, olderFormat: false, oldKey: author.old };
}

// Files on private tasks. Each is sealed under a fresh key of its own, name and type included,
// and only that key is wrapped under the task's key.
const fileSeal = {
  async seal(taskKey: TaskKey, taskId: string, bytes: Uint8Array, name: string, type: string): Promise<{ sealed: SealedFile; body: Uint8Array }> {
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
    const key = crypto.getRandomValues(new Uint8Array(32));
    const clean = fileMeta(name, type);
    const facts = fileFacts.list({ type: clean.type, size: bytes.length, hash: await digest(bytes), at: Date.now() });
    const meta = signedFacts.seal(clean.name, { kind: fileFacts.kind, place: fileFacts.place(taskId, id), facts, by: store.get().me!.id, signingPrivate: keyring.identity()!.signingPrivate });
    try {
      const [body, sealedMeta, wrapped] = await Promise.all([
        fileCipher.seal(key, taskKey.id, id, 'bytes', bytes),
        fileCipher.seal(key, taskKey.id, id, 'meta', utf8ToBytes(meta)),
        fileKeyWrap.wrap(taskKey.key, taskKey.id, id, key),
      ]);
      return { sealed: { id, seal: taskKey.id, meta: b64u.encode(sealedMeta), key: wrapped }, body };
    } finally {
      key.fill(0);
    }
  },

  // The file with its real name, type and size, or marked locked when this tab can't open it.
  async open(task: Task, file: Attachment): Promise<Attachment> {
    const sealed = file.sealed;
    if (!sealed) return file;
    try {
      const d = await withKey(task, sealed, (key) => details(task, sealed, key));
      const size = d.size === null ? file.size : d.size + fileCipher.overhead;
      return { ...file, filename: d.name, mime: d.type, size, locked: false, olderFormat: d.olderFormat, oldKey: d.oldKey };
    } catch {
      return { ...file, locked: true };
    }
  },

  // The file's bytes, which from format 2 on have to be the very ones its uploader signed.
  async decrypt(task: Task, sealed: SealedFile, blob: Uint8Array) {
    try {
      return await withKey(task, sealed, async (key) => {
        const d = await details(task, sealed, key);
        const bytes = await fileCipher.open(key, sealed.seal, sealed.id, 'bytes', blob);
        if (d.hash !== null && (bytes.length !== d.size || (await digest(bytes)) !== d.hash)) throw new Error('changed');
        return bytes;
      });
    } catch {
      throw new Error('This file couldn’t be decrypted and checked here.');
    }
  },

  // The same file key, wrapped under the task's fresh key instead of its current one.
  rewrap: (task: Task, sealed: SealedFile, to: TaskKey) => withKey(task, sealed, (key) => fileKeyWrap.wrap(to.key, to.id, sealed.id, key)),
};

export default fileSeal;
