import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import visibleTask from '../services/visibleTask.js';
import acceptApplication from '../services/acceptApplication.js';

const router = express.Router();

// Applicant wallet addresses are admin-only, like members' addresses.
const toApplication = (r) => ({ id: r.id, taskId: r.task_id, address: r.address, name: r.name, pitch: r.pitch, status: r.status, createdAt: r.created_at });

router.get(
  '/tasks/:id/applications',
  requireAdmin,
  route((req) => {
    const task = visibleTask(req.params.id, req.user, { allowDeleted: true });
    return sql.all('SELECT * FROM applications WHERE task_id = ? ORDER BY created_at', task.id).map(toApplication);
  }),
);

router.post('/applications/:id/accept', requireAdmin, route((req) => ({ task: acceptApplication(req.user, req.params.id) })));

router.post(
  '/applications/:id/decline',
  requireAdmin,
  route((req) => {
    const { changes } = sql.run("UPDATE applications SET status = 'declined', decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pending'", Date.now(), req.user.id, req.params.id);
    if (!changes) throw HttpError.notFound('That application');
    return { ok: true };
  }),
);

export default router;
