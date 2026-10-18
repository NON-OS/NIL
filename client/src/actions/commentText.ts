import store from '../state/store';
import keyring from '../state/keyring';
import commentVersions from '../state/commentVersions';
import taskText from '../lib/crypto/taskText';
import signedText from '../lib/crypto/signedText';
import signedFacts from '../lib/crypto/signedFacts';
import commentFacts from '../lib/crypto/commentFacts';
import taskKeys, { type TaskKey } from './taskKeys';
import keyDirectory from './keyDirectory';
import type Comment from '../types/Comment';
import type Task from '../types/Task';

// The older format signed over the task and the comment's author only.
const olderContext = (taskId: string, authorId: string | null) => `nil/comment/${taskId}/${authorId ?? ''}`;
const failed = () => new Error('Nil can’t confirm who wrote this comment.');

// Opens a comment and checks its signature. From format 2 on it covers the task, the comment's
// own id, its author, its edit number and when it was written, not the task's current key: it
// survives the comment moving to a new key when the task changes hands, and the server can't
// move a comment onto another task, swap two comments or put one under someone else's name.
// Whoever signs is normally the author; when a task turns private, its earlier plain comments
// are signed by the person sealing it.
async function payload(task: Task, comment: Comment) {
  const { id, key } = await taskKeys.open(task.sealed!);
  const json = await taskText.open(key, id, 'comment', comment.body);
  const { signed, facts } = signedFacts.open(json);
  if (!facts) {
    const author = await keyDirectory.author(signed.by, null, (k) => signedText.verify(signed, olderContext(task.id, comment.authorId), k));
    if (!author) throw failed();
    return { json, body: signed.text, edit: 0, olderFormat: true, oldKey: null };
  }
  const f = commentFacts.parse(facts);
  const statement = { kind: commentFacts.kind, place: commentFacts.place(task.id, comment.id, comment.authorId), facts: commentFacts.list(f) };
  const author = await keyDirectory.author(signed.by, f.at, (k) => signedFacts.verify(signed, statement, k));
  if (!author) throw failed();
  return { json, body: signed.text, edit: f.edit, olderFormat: false, oldKey: author.old };
}

// Comments on private tasks, signed and encrypted under the task's key. A comment that fails its
// check stays locked rather than shown.
const commentText = {
  seal(taskKey: TaskKey, taskId: string, comment: Pick<Comment, 'id' | 'authorId'>, edit: number, body: string) {
    const facts = commentFacts.list({ edit, at: Date.now() });
    const json = signedFacts.seal(body, { kind: commentFacts.kind, place: commentFacts.place(taskId, comment.id, comment.authorId), facts, by: store.get().me!.id, signingPrivate: keyring.identity()!.signingPrivate });
    return taskText.seal(taskKey.key, taskKey.id, 'comment', json);
  },

  // One past the newest edit of this comment that this browser knows of.
  nextEdit(comment: Comment) {
    const seen = commentVersions.seen(comment.id);
    return Math.max(comment.edit ?? 0, seen === 'deleted' ? 0 : seen) + 1;
  },

  async open(task: Task, comment: Comment): Promise<Comment> {
    if (!comment.sealed || !task.sealed) return comment;
    try {
      const opened = await payload(task, comment);
      const seen = commentVersions.seen(comment.id);
      if (seen === 'deleted') return { ...comment, body: '', locked: true, stale: 'deleted' };
      commentVersions.record(comment.id, opened.edit);
      return { ...comment, body: opened.body, locked: false, edit: opened.edit, olderFormat: opened.olderFormat, oldKey: opened.oldKey, stale: opened.edit < seen ? 'older' : null };
    } catch {
      return { ...comment, body: '', locked: true };
    }
  },

  // The comment under a new key with its signature untouched, or as plain text when the task
  // opens up (`to` is null). Throws if it can't be opened and checked here.
  async move(task: Task, comment: Comment, to: TaskKey | null) {
    if (!comment.sealed) return to ? commentText.seal(to, task.id, comment, 0, comment.body) : comment.body;
    const { json, body } = await payload(task, comment);
    return to ? taskText.seal(to.key, to.id, 'comment', json) : body;
  },
};

export default commentText;
