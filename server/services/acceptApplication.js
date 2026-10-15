import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import createAccount from './createAccount.js';
import publishUser from './publishUser.js';
import updateTask from './updateTask.js';
import loadTask from './loadTask.js';

// Accepting an outside applicant: they become a guest who sees only the task they were given
// (not its project), and the task is assigned to them. They sign in with the same wallet.
export default function acceptApplication(actor, applicationId) {
  const app = sql.get('SELECT * FROM applications WHERE id = ?', applicationId);
  if (!app || app.status !== 'pending') throw HttpError.notFound('That application');
  const task = loadTask(app.task_id);
  if (!task || task.deletedAt || task.assigneeId || task.status === 'done') throw new HttpError(409, 'This bounty is already taken or finished.');

  const existing = sql.get("SELECT u.id, u.deactivated FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.kind = 'wallet' AND c.external_id = ?", app.address);
  if (existing?.deactivated) throw HttpError.badRequest('This wallet belongs to someone whose access was removed.');
  const userId = existing?.id ?? createAccount({ mode: 'bounty', name: app.name, address: app.address });
  if (!existing) publishUser(userId);

  sql.tx(() => {
    sql.run("UPDATE applications SET status = 'accepted', decided_at = ?, decided_by = ? WHERE id = ?", Date.now(), actor.id, app.id);
    sql.run("UPDATE applications SET status = 'closed', decided_at = ? WHERE task_id = ? AND status = 'pending'", Date.now(), app.task_id);
  });
  return updateTask(actor, task.id, { assigneeId: userId }).task;
}
