import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import guestScope from '../services/guestScope.js';
import publishTask from '../services/publishTask.js';
import eraseTasks from '../services/eraseTasks.js';
import firstRunState from './firstRunState.js';

// Takes the sample project away in one go: its tasks are erased for good, not trashed. Tasks
// someone added to the project themselves are kept and simply lose the project.
export default function removeSample(user) {
  const sample = firstRunState.of(user.id)?.sample;
  if (!sample) throw HttpError.notFound('The sample project');

  const ids = sample.taskIds.filter((id) => sql.get('SELECT 1 FROM tasks WHERE id = ? AND project_id = ?', id, sample.projectId));
  eraseTasks(ids);
  for (const id of ids) hub.broadcast({ type: 'task.gone', id });

  const kept = sql.all('SELECT id FROM tasks WHERE project_id = ?', sample.projectId);
  sql.run('DELETE FROM projects WHERE id = ?', sample.projectId);
  hub.broadcast({ type: 'project.delete', id: sample.projectId });
  guestScope.forget();
  for (const { id } of kept) publishTask(id);

  firstRunState.update(user.id, { sample: null });
  return { removed: ids.length };
}
