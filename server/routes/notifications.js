import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import pageSize from '../lib/pageSize.js';
import hub from '../realtime/hub.js';
import toNotification from '../mappers/toNotification.js';

const router = express.Router();

const unreadCount = (userId) => sql.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', userId).n;

router.get(
  '/notifications',
  route((req) => {
    const limit = pageSize(req.query.limit, 60, 200);
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    return sql
      .all('SELECT * FROM notifications WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?', req.user.id, before, limit)
      .map(toNotification);
  }),
);

router.post(
  '/notifications/read',
  route((req) => {
    const now = Date.now();
    if (req.body.all) {
      sql.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now, req.user.id);
    } else if (Array.isArray(req.body.ids)) {
      sql.tx(() => {
        for (const id of req.body.ids.slice(0, 500)) {
          sql.run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', now, Number(id), req.user.id);
        }
      });
    }
    const unread = unreadCount(req.user.id);
    // keeps the badge in sync across the person's other tabs
    hub.toUser(req.user.id, { type: 'unread', unread });
    return { unread };
  }),
);

export default router;
