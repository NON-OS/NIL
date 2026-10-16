import sql from '../db/sql.js';
import publicWorkspace from '../services/publicWorkspace.js';
import tokenAmount from '../lib/tokenAmount.js';

const PRIORITY = ['none', 'low', 'medium', 'high', 'urgent'];
const name = (table, id, column = 'name') => (id ? sql.get(`SELECT ${column} AS v FROM ${table} WHERE id = ?`, id)?.v ?? null : null);

// A task as an AI assistant reads it: names instead of ids, the key people use, no internals.
// An encrypted private task shows only what the server itself can see: dates, status, people.
// Agents never get that far: private tasks are invisible to them.
export default function taskOut(task, { full = false } = {}) {
  const out = {
    key: `${publicWorkspace().taskPrefix}-${task.number}`,
    title: task.sealed ? 'Private task (encrypted)' : task.title,
    status: task.status,
    priority: PRIORITY[task.priority],
    assignee: name('users', task.assigneeId),
    project: name('projects', task.projectId),
    due: task.dueDate,
    private: task.private,
    bounty: task.bounty ? `${tokenAmount(task.bounty, task.bountyToken)}${task.bountyState === 'paid' ? ' (paid)' : ''}` : null,
  };
  if (!full) return out;
  return {
    ...out,
    description: task.description,
    goal: name('goals', task.goalId, 'title'),
    labels: task.labels.map((id) => name('labels', id)).filter(Boolean),
    // ids let an assistant tick an item without retyping it
    checklist: task.checklist.map((i) => ({ id: i.id, text: i.text, done: Boolean(i.done) })),
    watchers: sql.all('SELECT u.name FROM watchers w JOIN users u ON u.id = w.user_id WHERE w.task_id = ? ORDER BY u.name', task.id).map((r) => r.name),
    createdAt: new Date(task.createdAt).toISOString(),
    updatedAt: new Date(task.updatedAt).toISOString(),
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
  };
}
