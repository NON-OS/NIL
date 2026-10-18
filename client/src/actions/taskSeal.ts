import store from '../state/store';
import keyring from '../state/keyring';
import sealedCache from '../state/sealedCache';
import knownWords from '../state/knownWords';
import taskVersions from '../state/taskVersions';
import taskText, { type TaskField } from '../lib/crypto/taskText';
import taskRevision from '../lib/crypto/taskRevision';
import signedText from '../lib/crypto/signedText';
import isRollback from '../lib/isRollback';
import taskKeys, { type TaskKey } from './taskKeys';
import keyDirectory from './keyDirectory';
import type SealedTask from '../types/SealedTask';
import type TaskWords from '../types/TaskWords';
import type OpenedWords from '../types/OpenedWords';

// Opens one piece and checks the writer's signature against the key pinned for them, for this
// task, piece and revision. Words the server made up under a key of its own fail here, and the
// task stays closed.
async function openField(key: Uint8Array, sealId: string, field: TaskField, blob: string) {
  const json = await taskText.open(key, sealId, field, blob);
  const signed = signedText.open(json);
  const rev = taskRevision.of(json);
  const signingKey = await keyDirectory.signingKeyOf(signed.by);
  if (!signingKey || !signedText.verify(signed, taskText.context(sealId, field, rev), signingKey)) throw new Error('Nil can’t confirm a teammate wrote this private task.');
  return { text: signed.text, rev };
}

// Encrypts a private task's words under its key, each piece signed by whoever wrote it, and
// opens them again.
const taskSeal = {
  // `rev` is the revision these words become, one past the newest this browser knows of.
  async seal(words: TaskWords, { id, key }: TaskKey, keys: Record<string, string>, rev: number): Promise<SealedTask> {
    const by = store.get().me!.id;
    const signingPrivate = keyring.identity()!.signingPrivate;
    const field = (f: TaskField, text: string) => taskText.seal(key, id, f, taskRevision.add(signedText.seal(text, { context: taskText.context(id, f, rev), by, signingPrivate }), rev));
    const [title, description, checklist] = await Promise.all([field('title', words.title), field('description', words.description), field('checklist', JSON.stringify(words.checklist))]);
    const sealed = { id, title, description, checklist, keys };
    sealedCache.remember(sealed, { ...words, rev });
    return sealed;
  },

  // A card carries no encrypted notes, so it opens to its title and checklist only. Opening
  // the whole task later adds the notes, without decrypting the rest a second time. The
  // revision is checked against the task, not its key, which changes when it's handed on.
  async open(sealed: SealedTask, taskId: string): Promise<OpenedWords> {
    const known = knownWords(sealed, taskId);
    if (known && (known.description !== undefined || sealed.description === undefined)) return known;
    const { key } = await taskKeys.open(sealed);
    const title = known ? { text: known.title, rev: known.rev } : await openField(key, sealed.id, 'title', sealed.title);
    const checklist = known ? { text: JSON.stringify(known.checklist), rev: known.rev } : await openField(key, sealed.id, 'checklist', sealed.checklist);
    const description = sealed.description === undefined ? null : await openField(key, sealed.id, 'description', sealed.description);
    const revs = [title.rev, checklist.rev, ...(description ? [description.rev] : [])];
    const words: OpenedWords = {
      title: title.text,
      checklist: known?.checklist ?? JSON.parse(checklist.text),
      rev: Math.max(...revs),
      rollback: Boolean(known?.rollback) || isRollback(revs, taskVersions.seen(taskId)),
    };
    if (description) words.description = description.text;
    taskVersions.record(taskId, words.rev);
    sealedCache.remember(sealed, words);
    return words;
  },
};

export default taskSeal;
