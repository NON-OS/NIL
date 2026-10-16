import store from '../state/store';
import keyring from '../state/keyring';
import sealedCache from '../state/sealedCache';
import taskText, { type TaskField } from '../lib/crypto/taskText';
import signedText from '../lib/crypto/signedText';
import taskKeys, { type TaskKey } from './taskKeys';
import keyDirectory from './keyDirectory';
import type SealedTask from '../types/SealedTask';
import type TaskWords from '../types/TaskWords';
import type OpenedWords from '../types/OpenedWords';

// Opens one piece and checks the writer's signature against the key pinned for them. Words the
// server made up under a key of its own fail here, and the task stays closed.
async function openField(key: Uint8Array, sealId: string, field: TaskField, blob: string) {
  const signed = signedText.open(await taskText.open(key, sealId, field, blob));
  const signingKey = await keyDirectory.signingKeyOf(signed.by);
  if (!signingKey || !signedText.verify(signed, taskText.context(sealId, field), signingKey)) throw new Error('Nil can’t confirm a teammate wrote this private task.');
  return signed.text;
}

// Encrypts a private task's words under its key, each piece signed by whoever wrote it, and
// opens them again.
const taskSeal = {
  async seal(words: TaskWords, { id, key }: TaskKey, keys: Record<string, string>): Promise<SealedTask> {
    const by = store.get().me!.id;
    const signingPrivate = keyring.identity()!.signingPrivate;
    const field = (f: TaskField, text: string) => taskText.seal(key, id, f, signedText.seal(text, { context: taskText.context(id, f), by, signingPrivate }));
    const [title, description, checklist] = await Promise.all([field('title', words.title), field('description', words.description), field('checklist', JSON.stringify(words.checklist))]);
    const sealed = { id, title, description, checklist, keys };
    sealedCache.remember(sealed, words);
    return sealed;
  },

  // A card carries no encrypted notes, so it opens to its title and checklist only. Opening
  // the whole task later adds the notes, without decrypting the rest a second time.
  async open(sealed: SealedTask): Promise<OpenedWords> {
    const known = sealedCache.get(sealed);
    if (known && (known.description !== undefined || sealed.description === undefined)) return known;
    const { key } = await taskKeys.open(sealed);
    const words: OpenedWords = {
      title: known?.title ?? (await openField(key, sealed.id, 'title', sealed.title)),
      checklist: known?.checklist ?? JSON.parse(await openField(key, sealed.id, 'checklist', sealed.checklist)),
    };
    if (sealed.description !== undefined) words.description = await openField(key, sealed.id, 'description', sealed.description);
    sealedCache.remember(sealed, words);
    return words;
  },
};

export default taskSeal;
