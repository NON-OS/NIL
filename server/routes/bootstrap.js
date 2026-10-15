import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import config from '../config.js';
import toUser from '../mappers/toUser.js';
import toTask from '../mappers/toTask.js';
import toProject from '../mappers/toProject.js';
import toLabel from '../mappers/toLabel.js';
import toGoal from '../mappers/toGoal.js';
import publicWorkspace from '../services/publicWorkspace.js';

const router = express.Router();

// Everything the app needs on first paint, in one round trip.
router.get(
  '/bootstrap',
  route((req) => ({
    me: req.user,
    workspace: publicWorkspace(),
    users: sql.all('SELECT * FROM users ORDER BY name COLLATE NOCASE').map((row) => toUser(row, req.viewer)),
    projects: sql.all('SELECT * FROM projects ORDER BY position, created_at').map(toProject),
    labels: sql.all('SELECT * FROM labels ORDER BY name COLLATE NOCASE').map(toLabel),
    goals: sql.all('SELECT * FROM goals ORDER BY position, created_at').map(toGoal),
    tasks: sql.all('SELECT * FROM tasks WHERE deleted_at IS NULL').map(toTask),
    focus: sql.all('SELECT task_id AS taskId, day, position FROM focus WHERE user_id = ? ORDER BY position', req.user.id),
    unread: sql.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user.id).n,
    ai: config.ai.enabled,
  })),
);

export default router;
