import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import config from '../config.js';
import transferFee from '../services/transferFee.js';
import buildId from '../lib/buildId.js';
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
import taskCards from '../services/taskCards.js';
import archivedSql from '../services/archivedSql.js';
import archiveBoundary from '../services/archiveBoundary.js';
import archiveSummary from '../services/archiveSummary.js';
import keySite from '../keys/keySite.js';
import passkeyList from '../keys/passkeyList.js';
import signingKey from '../proofs/signingKey.js';

const router = express.Router();

// The people, projects and goals someone's app is built from. A guest gets only those around
// the projects shared with them.
function workspaceData(userId) {
  const projects = sql.all('SELECT * FROM projects ORDER BY position, created_at');
  const goals = sql.all('SELECT * FROM goals ORDER BY position, created_at');
  const scope = guestScope.of(userId);
  if (!scope) return { users: userRows.all(), projects, goals };
  const view = guestView(userId);
  return {
    users: userRows.all().filter((u) => view.people.has(u.id)),
    projects: projects.filter((p) => scope.has(p.id)),
    goals: goals.filter((g) => view.goals.has(g.id)),
  };
}

// Open work and recent history as cards, and where the archive of older closed tasks starts.
function recentCards(userId) {
  const before = archiveBoundary(userId);
  const visible = visibleSql(userId);
  const archived = archivedSql(before);
  const tasks = taskCards(`WHERE deleted_at IS NULL AND ${visible.where} AND NOT ${archived.where}`, ...visible.params, ...archived.params);
  const older = sql.get(`SELECT 1 FROM tasks WHERE deleted_at IS NULL AND ${archived.where} AND ${visible.where} LIMIT 1`, ...archived.params, ...visible.params);
  return { tasks, archive: { before, cursor: older ? `${before}.` : null, done: archiveSummary(userId, before).done } };
}

// Every task in full. Tabs opened before task cards existed still ask for this after an
// upgrade, and so may scripts built on the API, so it answers whoever doesn't ask for cards.
function allTasks(userId) {
  const visible = visibleSql(userId);
  return { tasks: sql.all(`SELECT * FROM tasks WHERE deleted_at IS NULL AND ${visible.where}`, ...visible.params).map(toTask) };
}

// Everything the app needs on first paint, in one round trip.
router.get(
  '/bootstrap',
  route((req) => {
    const data = workspaceData(req.user.id);
    const { tasks, archive } = req.query.tasks === 'cards' ? recentCards(req.user.id) : allTasks(req.user.id);
    return {
      me: req.user,
      workspace: publicWorkspace(),
      users: data.users.map((row) => toUser(row, req.viewer)),
      projects: data.projects.map(toProject),
      labels: sql.all('SELECT * FROM labels ORDER BY name COLLATE NOCASE').map(toLabel),
      goals: data.goals.map(toGoal),
      tasks,
      archive,
      focus: sql.all('SELECT task_id AS taskId, day, position FROM focus WHERE user_id = ? ORDER BY position', req.user.id),
      timer: toTimeEntry(sql.get('SELECT * FROM time_entries WHERE user_id = ? AND ended_at IS NULL', req.user.id)),
      unread: sql.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user.id).n,
      guest: Boolean(guestScope.of(req.user.id)),
      sharing: sharingPolicy.get(),
      // guests work inside someone else's subscription; they don't need its details
      plan: guestScope.of(req.user.id) ? { unlocked: plan.status().unlocked } : plan.status(),
      ai: config.ai.enabled,
      nox: config.nox.enabled
        ? { token: config.nox.token, chainId: config.nox.chainId, symbol: config.nox.symbol, decimals: config.nox.decimals, explorer: config.nox.explorer, transferFeeBps: transferFee.current().bps }
        : null,
      rewards: config.nox.enabled ? config.rewards : [],
      stealth: config.nox.enabled ? { announcer: config.stealth.announcer, gasTopUpWei: config.stealth.gasTopUpWei } : null,
      sourceUrl: config.sourceUrl,
      // the web app this server hands out, so an open tab can notice it's out of date
      build: buildId(),
      // what key messages are bound to: the configured site (APP_URL) and the workspace's signing key
      origin: keySite().origin,
      workspaceKey: signingKey.publicKey(),
      // your own passkey wraps and when you last saved a recovery kit; nobody else's ever come here
      passkeys: passkeyList(req.user.id),
      recoveryKitAt: sql.get('SELECT kit_saved_at FROM encryption_keys WHERE user_id = ?', req.user.id)?.kit_saved_at ?? null,
    };
  }),
);

export default router;
