import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import toActivity from '../mappers/toActivity.js';
import visibleSql from '../services/visibleSql.js';

const router = express.Router();

router.get(
  '/activity',
  route((req) => {
    const limit = Math.min(Number(req.query.limit) || 80, 300);
    const visible = visibleSql(req.user.id, 't');
    return sql
      .all(`SELECT a.* FROM activity a JOIN tasks t ON t.id = a.task_id WHERE t.deleted_at IS NULL AND ${visible.where} ORDER BY a.id DESC LIMIT ?`, ...visible.params, limit)
      .map(toActivity);
  }),
);

export default router;
