import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import config from '../config.js';
import toUser from '../mappers/toUser.js';
import userRows from '../services/userRows.js';
import toTask from '../mappers/toTask.js';
import toProject from '../mappers/toProject.js';
import toLabel from '../mappers/toLabel.js';
import toGoal from '../mappers/toGoal.js';
import publicWorkspace from '../services/publicWorkspace.js';
import visibleSql from '../services/visibleSql.js';
import guestScope from '../services/guestScope.js';
import guestView from '../services/guestView.js';
import sharingPolicy from '../services/sharingPolicy.js';
import plan from '../services/plan.js';
import toTimeEntry from '../mappers/toTimeEntry.js';

const router = express.Router();

// Everything the app needs on first paint, in one round trip.
function workspaceData(req) {
  const scope = guestScope.of(req.user.id);
  if (!scope) {
    const visible = visibleSql(req.user.id);
    return {
      users: userRows.all(),
      projects: sql.all('SELECT * FROM projects ORDER BY position, created_at'),
      goals: sql.all('SELECT * FROM goals ORDER BY position, created_at'),
      tasks: sql.all(`SELECT * FROM tasks WHERE deleted_at IS NULL AND ${visible.where}`, ...visible.params),
    };
  }
  const view = guestView(req.user.id, scope);
  return {
    users: userRows.all().filter((u) => view.people.has(u.id)),
    projects: sql.all('SELECT * FROM projects ORDER BY position, created_at').filter((p) => scope.has(p.id)),
    goals: sql.all('SELECT * FROM goals ORDER BY position, created_at').filter((g) => view.goals.has(g.id)),
    tasks: view.tasks,
  };
}

// Everything the app needs on first paint, in one round trip.
router.get(
  '/bootstrap',
  route((req) => {
    const data = workspaceData(req);
    return {
      me: req.user,
      workspace: publicWorkspace(),
      users: data.users.map((row) => toUser(row, req.viewer)),
      projects: data.projects.map(toProject),
      labels: sql.all('SELECT * FROM labels ORDER BY name COLLATE NOCASE').map(toLabel),
      goals: data.goals.map(toGoal),
      tasks: data.tasks.map(toTask),
      focus: sql.all('SELECT task_id AS taskId, day, position FROM focus WHERE user_id = ? ORDER BY position', req.user.id),
      timer: toTimeEntry(sql.get('SELECT * FROM time_entries WHERE user_id = ? AND ended_at IS NULL', req.user.id)),
      unread: sql.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user.id).n,
      guest: Boolean(guestScope.of(req.user.id)),
      sharing: sharingPolicy.get(),
      // guests work inside someone else's subscription; they don't need its details
      plan: guestScope.of(req.user.id) ? { unlocked: plan.status().unlocked } : plan.status(),
      ai: config.ai.enabled,
      nox: config.nox.enabled
        ? { token: config.nox.token, chainId: config.nox.chainId, symbol: config.nox.symbol, decimals: config.nox.decimals, explorer: config.nox.explorer }
        : null,
      rewards: config.nox.enabled ? config.rewards : [],
      sourceUrl: config.sourceUrl,
    };
  }),
);

export default router;
