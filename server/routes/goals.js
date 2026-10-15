import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import domain from '../lib/domain.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import publishTask from '../services/publishTask.js';
import toGoal from '../mappers/toGoal.js';
import guestScope from '../services/guestScope.js';

const router = express.Router();

function fields(b) {
  const out = {};
  if ('title' in b) out.title = check.text(b.title, 'Goal', { min: 1, max: 200 });
  if ('description' in b) out.description = check.text(b.description, 'Description', { max: 5000 });
  if ('ownerId' in b) out.owner_id = check.ref('users', b.ownerId, 'Owner');
  if ('status' in b) out.status = check.oneOf(b.status, domain.goalStatuses, 'Goal status');
  if ('targetDate' in b) out.target_date = check.date(b.targetDate, 'Target date');
  if ('metricName' in b) out.metric_name = check.text(b.metricName, 'Metric', { max: 80 });
  if ('metricStart' in b) out.metric_start = check.number(b.metricStart, 'Starting value');
  if ('metricCurrent' in b) out.metric_current = check.number(b.metricCurrent, 'Current value');
  if ('metricTarget' in b) out.metric_target = check.number(b.metricTarget, 'Target value');
  if ('position' in b) out.position = check.number(b.position, 'Position') ?? 0;
  return out;
}

function publish(id) {
  const goal = toGoal(sql.get('SELECT * FROM goals WHERE id = ?', id));
  hub.broadcast((viewer) => (guestScope.of(viewer.id) ? null : { type: 'goal', goal }));
  return { goal };
}

router.post(
  '/goals',
  route((req) => {
    const f = { owner_id: req.user.id, ...fields(req.body) };
    if (!f.title) throw HttpError.badRequest('Goal can’t be empty.');
    const id = newId();
    const now = Date.now();
    const position = (sql.get('SELECT MAX(position) AS m FROM goals').m ?? 0) + 1024;
    Object.assign(f, { id, position, created_by: req.user.id, created_at: now, updated_at: now });
    const columns = Object.keys(f);
    sql.run(`INSERT INTO goals (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, ...columns.map((c) => f[c]));
    return publish(id);
  }),
);

router.patch(
  '/goals/:id',
  route((req) => {
    const { id } = req.params;
    if (!sql.get('SELECT 1 FROM goals WHERE id = ?', id)) throw HttpError.notFound('That goal');
    const f = fields(req.body);
    const columns = Object.keys(f);
    if (columns.length) {
      sql.run(`UPDATE goals SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...columns.map((c) => f[c]), Date.now(), id);
    }
    return publish(id);
  }),
);

router.delete(
  '/goals/:id',
  route((req) => {
    const linked = sql.all('SELECT id FROM tasks WHERE goal_id = ?', req.params.id);
    sql.run('DELETE FROM goals WHERE id = ?', req.params.id);
    hub.broadcast({ type: 'goal.delete', id: req.params.id });
    for (const { id } of linked) publishTask(id);
    return { ok: true };
  }),
);

export default router;
