import sql from '../db/sql.js';
import toTask from '../mappers/toTask.js';
import publicWorkspace from './publicWorkspace.js';
import tokenAmount from '../lib/tokenAmount.js';

const line = (t, prefix) => ({ key: `${prefix}-${t.number}`, title: t.title, status: t.status, priority: t.priority, due: t.dueDate });

// The read-only view behind a share link. Deliberately thin: no people, no comments, no
// files, no wallet addresses, and never a private task.
export default function publicShare(link) {
  const ws = publicWorkspace();
  if (link.kind === 'project') {
    const project = sql.get('SELECT * FROM projects WHERE id = ?', link.target_id);
    if (!project) return null;
    const tasks = sql.all("SELECT * FROM tasks WHERE project_id = ? AND deleted_at IS NULL AND private = 0 AND status != 'canceled' ORDER BY status = 'done', position LIMIT 300", project.id).map(toTask);
    return {
      kind: 'project',
      workspace: ws.name,
      project: { name: project.name, key: project.key, color: project.color },
      counts: { total: tasks.length, done: tasks.filter((t) => t.status === 'done').length },
      tasks: tasks.map((t) => line(t, ws.taskPrefix)),
    };
  }
  const task = toTask(sql.get('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL AND private = 0', link.target_id));
  if (!task) return null;
  return {
    kind: 'task',
    workspace: ws.name,
    task: {
      ...line(task, ws.taskPrefix),
      description: task.description,
      checklist: { done: task.checklist.filter((i) => i.done).length, total: task.checklist.length },
      bounty: task.bounty ? tokenAmount(task.bounty, task.bountyToken) : null,
    },
  };
}
