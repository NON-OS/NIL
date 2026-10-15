import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import calendar from '../lib/calendar.js';
import requireAdmin from '../auth/requireAdmin.js';
import publicWorkspace from '../services/publicWorkspace.js';
import toUser from '../mappers/toUser.js';
import userRows from '../services/userRows.js';
import toTask from '../mappers/toTask.js';
import toProject from '../mappers/toProject.js';
import toLabel from '../mappers/toLabel.js';
import toGoal from '../mappers/toGoal.js';
import toComment from '../mappers/toComment.js';
import toActivity from '../mappers/toActivity.js';

const router = express.Router();
const PRIORITY = ['None', 'Low', 'Medium', 'High', 'Urgent'];

// Leading =, +, - or @ would run as a formula when the CSV is opened in a spreadsheet.
function cell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const nameMap = (rows, key = 'name') => new Map(rows.map((r) => [r.id, r[key]]));

router.get(
  '/export/tasks.csv',
  route((req, res) => {
    const { taskPrefix } = publicWorkspace();
    const users = nameMap(sql.all('SELECT id, name FROM users'));
    const projects = nameMap(sql.all('SELECT id, name FROM projects'));
    const goals = nameMap(sql.all('SELECT id, title FROM goals'), 'title');
    const labels = nameMap(sql.all('SELECT id, name FROM labels'));
    const header = ['Key', 'Title', 'Status', 'Priority', 'Project', 'Goal', 'Assignee', 'Due', 'Start', 'Estimate', 'Labels', 'Created', 'Completed', 'Description'];
    const lines = [header.join(',')];
    for (const t of sql.all('SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY number').map(toTask)) {
      lines.push(
        [
          `${taskPrefix}-${t.number}`, t.title, t.status, PRIORITY[t.priority],
          projects.get(t.projectId), goals.get(t.goalId), users.get(t.assigneeId),
          t.dueDate, t.startDate, t.estimate,
          t.labels.map((id) => labels.get(id)).filter(Boolean).join('; '),
          new Date(t.createdAt).toISOString(), t.completedAt ? new Date(t.completedAt).toISOString() : '',
          t.description,
        ].map(cell).join(','),
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nonos-tasks-${calendar.today()}.csv"`);
    res.send(`﻿${lines.join('\r\n')}`);
  }),
);

// Full backup for admins. Sessions, invite tokens and keys are never included.
router.get(
  '/export/backup.json',
  requireAdmin,
  route((req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="nonos-backup-${calendar.today()}.json"`);
    return {
      exportedAt: new Date().toISOString(),
      workspace: publicWorkspace(),
      users: userRows.all().map((row) => toUser(row, req.viewer)),
      projects: sql.all('SELECT * FROM projects').map(toProject),
      labels: sql.all('SELECT * FROM labels').map(toLabel),
      goals: sql.all('SELECT * FROM goals').map(toGoal),
      tasks: sql.all('SELECT * FROM tasks').map(toTask),
      comments: sql.all('SELECT * FROM comments').map(toComment),
      activity: sql.all('SELECT * FROM activity ORDER BY id').map(toActivity),
    };
  }),
);

export default router;
