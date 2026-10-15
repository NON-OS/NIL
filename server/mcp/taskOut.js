import sql from '../db/sql.js';
import publicWorkspace from '../services/publicWorkspace.js';
import tokenAmount from '../lib/tokenAmount.js';

const name = (table, id, column = 'name') => (id ? sql.get(`SELECT ${column} AS v FROM ${table} WHERE id = ?`, id)?.v ?? null : null);

// A task as an AI assistant reads it: names instead of ids, the key people use, no internals.
export default function taskOut(task, { full = false } = {}) {
  const out = {
    key: `${publicWorkspace().taskPrefix}-${task.number}`,
    title: task.title,
    status: task.status,
    priority: ['none', 'low', 'medium', 'high', 'urgent'][task.priority],
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
    checklist: task.checklist.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`),
    createdAt: new Date(task.createdAt).toISOString(),
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
  };
}
