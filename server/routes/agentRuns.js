import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import parseJSON from '../lib/parseJSON.js';
import requireAdmin from '../auth/requireAdmin.js';
import visibleTask from '../services/visibleTask.js';
import loadTask from '../services/loadTask.js';
import canSeeTask from '../services/canSeeTask.js';
import agentOr404 from '../agents/manage/agentOr404.js';
import approvers from '../agents/approvers.js';
import decideApproval from '../agents/decideApproval.js';
import toApproval from '../agents/toApproval.js';
import toRun from '../agents/runner/toRun.js';
import worker from '../agents/runner/worker.js';

const router = express.Router();

const toAudit = (r) => ({
  id: r.id,
  actorId: r.actor_id,
  actingForId: r.acting_for,
  via: r.via,
  action: r.action,
  taskId: r.task_id,
  runId: r.run_id,
  outcome: r.outcome,
  detail: parseJSON(r.detail, {}),
  createdAt: r.created_at,
});

// Agent runs and approval cards on one task, for its timeline. Whoever can see the task sees
// what agents did on it.
router.get(
  '/tasks/:id/agent-activity',
  route((req) => {
    const task = visibleTask(req.params.id, req.user, { allowDeleted: true });
    return {
      runs: sql.all('SELECT * FROM agent_runs WHERE task_id = ? ORDER BY created_at DESC LIMIT 20', task.id).map((r) => toRun(r, { withSteps: true })),
      approvals: sql.all('SELECT * FROM agent_approvals WHERE task_id = ? ORDER BY created_at', task.id).map(toApproval),
    };
  }),
);

router.get('/agents/:id/runs', requireAdmin, route((req) => ({ runs: sql.all('SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT 50', agentOr404(req.params.id).id).map((r) => toRun(r)) })));

router.get(
  '/agent-runs/:id',
  route((req) => {
    const row = sql.get('SELECT * FROM agent_runs WHERE id = ?', req.params.id);
    const task = row?.task_id ? loadTask(row.task_id) : null;
    if (!row || (!req.user.isAdmin && !(task && canSeeTask(task, req.user)))) throw HttpError.notFound('That run');
    return { run: toRun(row, { withSteps: true }) };
  }),
);

router.post(
  '/agent-runs/:id/cancel',
  requireAdmin,
  route((req) => {
    if (!sql.get("SELECT 1 FROM agent_runs WHERE id = ? AND status IN ('queued', 'running')", req.params.id)) throw new HttpError(409, 'That run has already finished.');
    worker.cancel(req.params.id, `Cancelled by ${req.user.name}.`);
    return { ok: true };
  }),
);

router.get(
  '/agents/:id/audit',
  requireAdmin,
  route((req) => {
    const agent = agentOr404(req.params.id);
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    return { entries: sql.all('SELECT * FROM agent_audit WHERE agent_id = ? AND id < ? ORDER BY id DESC LIMIT ?', agent.id, before, limit).map(toAudit) };
  }),
);

// Requests waiting on the caller: every pending one for admins, the ones on their tasks for others.
router.get(
  '/agent-approvals',
  route((req) => ({
    approvals: sql
      .all("SELECT * FROM agent_approvals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100")
      .filter((row) => {
        const task = row.task_id ? loadTask(row.task_id) : null;
        return (!task || canSeeTask(task, req.user)) && approvers(task).has(req.user.id);
      })
      .map(toApproval),
  })),
);

router.post('/agent-approvals/:id/approve', route((req) => ({ approval: decideApproval(req.params.id, req.user, true) })));
router.post('/agent-approvals/:id/decline', route((req) => ({ approval: decideApproval(req.params.id, req.user, false) })));

export default router;
