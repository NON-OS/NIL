import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import calendar from '../lib/calendar.js';
import firstRunState from '../firstRun/firstRunState.js';
import addSample from '../firstRun/addSample.js';
import removeSample from '../firstRun/removeSample.js';

const router = express.Router();

// What the getting-started card needs from the server. Projects and private tasks it can see
// in the app already; whether anyone was invited and whether quick add was tried it can't.
// A sample project is reported even after the card is dismissed, so it can still be removed.
function view(userId) {
  const state = firstRunState.of(userId);
  if (!state) return { active: false };
  const sample = state.sample && sql.get('SELECT 1 FROM projects WHERE id = ?', state.sample.projectId) ? { projectId: state.sample.projectId } : null;
  if (state.dismissed) return { active: false, sample };
  const invited = Boolean(sql.get('SELECT 1 FROM invites WHERE created_by = ? LIMIT 1', userId)) || sql.get('SELECT COUNT(*) AS n FROM users').n > 1;
  return { active: true, quickAdd: state.quickAdd, invited, sample };
}

router.get('/first-run', route((req) => view(req.user.id)));

router.patch(
  '/first-run',
  route((req) => {
    const patch = {};
    if (req.body?.dismissed === true) patch.dismissed = true;
    if (req.body?.quickAdd === true) patch.quickAdd = true;
    firstRunState.update(req.user.id, patch);
    return view(req.user.id);
  }),
);

router.post(
  '/first-run/sample',
  route((req) => {
    addSample(req.user, check.date(req.body?.today, 'Today') ?? calendar.today());
    return view(req.user.id);
  }),
);

router.delete(
  '/first-run/sample',
  route((req) => {
    removeSample(req.user);
    return view(req.user.id);
  }),
);

export default router;
