import addComment from '../../services/addComment.js';
import findTaskByKey from '../../services/findTaskByKey.js';

export default {
  name: 'add_comment',
  title: 'Comment on a task',
  description: 'Post a comment on a task as the caller. Markdown works. @Name mentions notify people, as in the app (list_people gives each handle).',
  write: true,
  http: { method: 'POST', path: '/tasks/{key}/comments', status: 201 },
  inputSchema: {
    type: 'object',
    properties: { key: { type: 'string', description: 'Task key, like NON-12' }, text: { type: 'string', minLength: 1, maxLength: 10_000 } },
    required: ['key', 'text'],
    additionalProperties: false,
  },
  run(args, { user, guard }) {
    const task = findTaskByKey(args.key, user);
    guard.touch(task.id);
    guard.check();
    const comment = addComment(user, task.id, args.text);
    guard.done(task.id);
    return { ok: true, key: args.key, commentId: comment.id };
  },
};
