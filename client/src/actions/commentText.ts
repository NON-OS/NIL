import store from '../state/store';
import keyring from '../state/keyring';
import taskText from '../lib/crypto/taskText';
import signedText from '../lib/crypto/signedText';
import taskKeys, { type TaskKey } from './taskKeys';
import keyDirectory from './keyDirectory';
import type Comment from '../types/Comment';
import type Task from '../types/Task';

// The signature covers the task and the comment's author, not the task's current key: it
// survives the comment moving to a new key when the task changes hands, and the server can't
// move a comment onto another task or put it under someone else's name. Whoever signs is
// normally the author; when a task turns private, its earlier plain comments are signed by the
// person sealing it.
const context = (taskId: string, authorId: string | null) => `nil/comment/${taskId}/${authorId ?? ''}`;

async function payload(task: Task, comment: Comment) {
  const { id, key } = await taskKeys.open(task.sealed!);
  const json = await taskText.open(key, id, 'comment', comment.body);
  const signed = signedText.open(json);
  const author = await keyDirectory.author(signed.by, null, (k) => signedText.verify(signed, context(task.id, comment.authorId), k));
  if (!author) throw new Error('Nil can’t confirm who wrote this comment.');
  return { json, body: signed.text };
}

// Comments on private tasks, signed and encrypted under the task's key. A comment that fails its
// check stays locked rather than shown.
const commentText = {
  async seal(taskKey: TaskKey, taskId: string, authorId: string | null, body: string) {
    const json = signedText.seal(body, { context: context(taskId, authorId), by: store.get().me!.id, signingPrivate: keyring.identity()!.signingPrivate });
    return taskText.seal(taskKey.key, taskKey.id, 'comment', json);
  },

  async open(task: Task, comment: Comment): Promise<Comment> {
    if (!comment.sealed || !task.sealed) return comment;
    try {
      return { ...comment, body: (await payload(task, comment)).body, locked: false };
    } catch {
      return { ...comment, body: '', locked: true };
    }
  },

  // The comment under a new key with its signature untouched, or as plain text when the task
  // opens up (`to` is null). Throws if it can't be opened and checked here.
  async move(task: Task, comment: Comment, to: TaskKey | null) {
    if (!comment.sealed) return to ? commentText.seal(to, task.id, comment.authorId, comment.body) : comment.body;
    const { json, body } = await payload(task, comment);
    return to ? taskText.seal(to.key, to.id, 'comment', json) : body;
  },
};

export default commentText;
