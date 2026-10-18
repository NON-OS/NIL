import store from '../state/store';
import keyring from '../state/keyring';
import sealedCache from '../state/sealedCache';
import taskVersions from '../state/taskVersions';
import taskReaders from '../state/taskReaders';
import taskText, { type TaskField } from '../lib/crypto/taskText';
import taskRevision from '../lib/crypto/taskRevision';
import taskFacts, { type TaskFacts, type TaskReaders } from '../lib/crypto/taskFacts';
import signedText from '../lib/crypto/signedText';
import signedFacts from '../lib/crypto/signedFacts';
import keyHash from '../lib/crypto/keyHash';
import isRollback from '../lib/isRollback';
import readersCover from '../lib/readersCover';
import taskKeys, { type TaskKey } from './taskKeys';
import keyDirectory from './keyDirectory';
import type SealedTask from '../types/SealedTask';
import type Task from '../types/Task';
import type TaskWords from '../types/TaskWords';
import type OpenedWords from '../types/OpenedWords';

export type SealedRef = Pick<Task, 'id' | 'creatorId' | 'assigneeId'> & { sealed: SealedTask };

interface Piece {
  text: string;
  rev: number;
  by: string;
  facts: TaskFacts | null;
  old: string | null;
}

const refused = () => new Error('Nil can’t confirm a teammate wrote this private task for the people it shows.');

// Opens one piece and checks it. From format 2 on, the writer has to be one of the people the
// task was sealed for (or the assignee who handed it on), the key it opened with has to be the
// one they signed, and their signature has to check out against a key this person can see for
// them. An older piece only names its writer, who has to be the task's creator or assignee.
async function openField(key: Uint8Array, task: SealedRef, field: TaskField, blob: string): Promise<Piece> {
  const json = await taskText.open(key, task.sealed.id, field, blob);
  const { signed, facts } = signedFacts.open(json);
  if (!facts) {
    const rev = taskRevision.of(json);
    const writer = [task.creatorId, task.assigneeId].includes(signed.by);
    const author = writer && (await keyDirectory.author(signed.by, null, (k) => signedText.verify(signed, taskText.context(task.sealed.id, field, rev), k)));
    if (!author) throw refused();
    return { text: signed.text, rev, by: signed.by, facts: null, old: null };
  }
  const f = taskFacts.parse(facts);
  if (!taskFacts.signer(f, signed.by) || f.key !== keyHash(key)) throw refused();
  const statement = { kind: taskFacts.kind, place: taskFacts.place(task.sealed.id, field), facts: taskFacts.list(f) };
  const author = await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k));
  if (!author) throw refused();
  return { text: signed.text, rev: f.rev, by: signed.by, facts: f, old: author.old };
}

type Sealing = Pick<OpenedWords, 'readers' | 'from' | 'key'>;

// Every piece of one seal names the same readers and key, or none at all.
const sealedAlike = (a: Sealing, b: Sealing) => JSON.stringify([a.readers, a.from, a.key]) === JSON.stringify([b.readers, b.from, b.key]);
const factsOf = (p: Piece): Sealing => ({ readers: p.facts?.readers ?? null, from: p.facts?.from ?? null, key: p.facts?.key ?? null });

// Words have to be for the people the task shows now, cached ones too. A hand-on has to come from
// someone this browser last saw as a reader of the task, when it has seen the task before.
function shownTo(words: OpenedWords, task: SealedRef) {
  if (!readersCover(words, task)) throw refused();
  const seen = taskReaders.last(task.id);
  if (words.from && seen && seen.seal !== task.sealed.id && !seen.readers.includes(words.from)) throw refused();
  if (words.readers && seen?.seal !== task.sealed.id) taskReaders.record(task.id, { seal: task.sealed.id, readers: words.readers });
  return words;
}

// Encrypts a private task's words under its key, each piece signed by whoever wrote it together
// with who the task is for, and opens them again.
const taskSeal = {
  // `rev` is the revision these words become, one past the newest this browser knows of, and
  // `readers` the creator and assignee they're for. Only those two keep a copy of the key. An
  // assignee handing the task to someone else isn't one of them, and says so as `from`.
  async seal(words: TaskWords, { id, key }: TaskKey, keys: Record<string, string>, { rev, readers }: { rev: number; readers: TaskReaders }): Promise<SealedTask> {
    const by = store.get().me!.id;
    const signingPrivate = keyring.identity()!.signingPrivate;
    const facts: TaskFacts = { rev, at: Date.now(), readers, from: readers.includes(by) ? null : by, key: keyHash(key) };
    const field = (f: TaskField, text: string) => taskText.seal(key, id, f, signedFacts.seal(text, { kind: taskFacts.kind, place: taskFacts.place(id, f), facts: taskFacts.list(facts), by, signingPrivate }));
    const [title, description, checklist] = await Promise.all([field('title', words.title), field('description', words.description), field('checklist', JSON.stringify(words.checklist))]);
    const sealed = { id, title, description, checklist, keys: Object.fromEntries(Object.entries(keys).filter(([userId]) => readers.includes(userId))) };
    sealedCache.remember(sealed, { ...words, rev, by, readers, from: facts.from, key: facts.key, at: facts.at, oldKey: null });
    return sealed;
  },

  // A card carries no encrypted notes, so it opens to its title and checklist only. Opening
  // the whole task later adds the notes, without decrypting the rest a second time. The
  // revision is checked against the task, not its key, which changes when it's handed on.
  async open(task: SealedRef): Promise<OpenedWords> {
    const { sealed } = task;
    const known = sealedCache.get(sealed);
    if (known && (known.description !== undefined || sealed.description === undefined)) return shownTo(known, task);
    const { key } = await taskKeys.open(sealed);
    try {
      const title = known ? null : await openField(key, task, 'title', sealed.title);
      const checklist = known ? null : await openField(key, task, 'checklist', sealed.checklist);
      const description = sealed.description === undefined ? null : await openField(key, task, 'description', sealed.description);
      const pieces = [title, checklist, description].filter((p): p is Piece => p !== null);
      const base = known ?? { ...factsOf(pieces[0]), by: pieces[0].by };
      if (pieces.some((p) => !sealedAlike(factsOf(p), base))) throw refused();
      const revs = [...(known ? [known.rev] : []), ...pieces.map((p) => p.rev)];
      const words: OpenedWords = {
        title: known?.title ?? title!.text,
        checklist: known?.checklist ?? JSON.parse(checklist!.text),
        rev: Math.max(...revs),
        rollback: Boolean(known?.rollback) || isRollback(revs, taskVersions.seen(task.id)),
        by: base.by,
        readers: base.readers,
        from: base.from,
        key: base.key,
        at: known?.at ?? pieces[0].facts?.at ?? null,
        oldKey: known?.oldKey ?? pieces.find((p) => p.old)?.old ?? null,
      };
      if (description) words.description = description.text;
      shownTo(words, task);
      taskVersions.record(task.id, words.rev);
      sealedCache.remember(sealed, words);
      return words;
    } catch (err) {
      keyring.forgetTaskKey(sealed.id);
      throw err;
    }
  },

  // The task's key for writing under: only once its words opened and checked out here, and only
  // the very key they were signed for.
  async key(task: SealedRef): Promise<TaskKey> {
    const words = await taskSeal.open(task);
    const key = await taskKeys.open(task.sealed);
    if (words.key && keyHash(key.key) !== words.key) {
      keyring.forgetTaskKey(task.sealed.id);
      throw refused();
    }
    return key;
  },
};

export default taskSeal;
