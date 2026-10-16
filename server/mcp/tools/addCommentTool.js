import addComment from '../../services/addComment.js';
import findTaskByKey from '../../services/findTaskByKey.js';

export default {
  name: 'add_comment',
  title: 'Comment on a task',
  description: 'Post a comment on a task as the user. @Name mentions notify people, as in the app.',
  write: true,
  inputSchema: { type: 'object', properties: { key: { type: 'string' }, text: { type: 'string' } }, required: ['key', 'text'], additionalProperties: false },
  run(args, user) {
    const task = findTaskByKey(args.key, user);
    addComment(user, task.id, args.text);
    return { ok: true, key: args.key };
  },
};
