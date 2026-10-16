import taskKeys, { type TaskKey } from './taskKeys';
import taskText from '../lib/crypto/taskText';
import type Comment from '../types/Comment';
import type Task from '../types/Task';

// The author's id travels inside the encrypted comment, so the server can't pass one person's
// words off as someone else's, and a comment still opens after its author leaves.
const commentText = {
  async seal(taskKey: TaskKey, authorId: string | null, body: string) {
    return taskText.seal(taskKey.key, taskKey.id, 'comment', JSON.stringify({ by: authorId, body }));
  },

  async open(task: Task, comment: Comment): Promise<Comment> {
    if (!comment.sealed || !task.sealed) return comment;
    try {
      const taskKey = await taskKeys.open(task.sealed);
      const { by, body } = JSON.parse(await taskText.open(taskKey.key, taskKey.id, 'comment', comment.body));
      if (comment.authorId && by !== comment.authorId) throw new Error('author mismatch');
      return { ...comment, body, locked: false };
    } catch {
      return { ...comment, body: '', locked: true };
    }
  },
};

export default commentText;
