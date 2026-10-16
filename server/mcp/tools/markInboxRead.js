import sql from '../../db/sql.js';
import HttpError from '../../lib/HttpError.js';
import hub from '../../realtime/hub.js';

// Only touches the caller's own notifications, so a read-only key may use it too.
export default {
  name: 'mark_inbox_read',
  title: 'Mark inbox items read',
  description: 'Mark notifications as read, by the ids my_inbox returned, or all of them.',
  write: false,
  mutates: true,
  http: { method: 'POST', path: '/me/inbox/read' },
  inputSchema: {
    type: 'object',
    properties: {
      ids: { type: 'array', items: { type: 'integer' }, maxItems: 200 },
      all: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  run(args, { user }) {
    if (!args.all && !args.ids?.length) throw HttpError.badRequest('Pass the ids to mark read, or all: true.');
    const now = Date.now();
    if (args.all) sql.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now, user.id);
    else sql.tx(() => args.ids.forEach((id) => sql.run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', now, id, user.id)));
    const unread = sql.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', user.id).n;
    // keeps the badge right in a person's open tabs when their own assistant clears the inbox
    hub.toUser(user.id, { type: 'unread', unread });
    return { unread };
  },
};
