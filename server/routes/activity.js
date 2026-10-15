import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import toActivity from '../mappers/toActivity.js';

const router = express.Router();

router.get(
  '/activity',
  route((req) => {
    const limit = Math.min(Number(req.query.limit) || 80, 300);
    return sql
      .all('SELECT a.* FROM activity a JOIN tasks t ON t.id = a.task_id WHERE t.deleted_at IS NULL ORDER BY a.id DESC LIMIT ?', limit)
      .map(toActivity);
  }),
);

export default router;
