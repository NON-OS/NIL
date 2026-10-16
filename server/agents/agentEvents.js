import sql from '../db/sql.js';
import loadTask from '../services/loadTask.js';
import canSeeTask from '../services/canSeeTask.js';
import publicWorkspace from '../services/publicWorkspace.js';
import agentScope from './agentScope.js';
import agentSettings from './agentSettings.js';
import enqueueDelivery from './webhooks/enqueueDelivery.js';
import enqueueRun from './runner/enqueueRun.js';

const person = (id) => (id ? sql.get('SELECT id, name, kind FROM users WHERE id = ?', id) : null);
const actorOut = (actor) => (actor ? { id: actor.id, name: actor.name, kind: actor.kind === 'agent' ? 'agent' : 'person' } : null);
const taskRef = (task) => ({ id: task.id, key: `${publicWorkspace().taskPrefix}-${task.number}` });

// The comment a mention or comment notification is about: the actor's newest one on the task,
// since notifications are sent straight after the comment is saved.
const latestComment = (taskId, authorId) => sql.get('SELECT id FROM comments WHERE task_id = ? AND author_id = ? ORDER BY created_at DESC LIMIT 1', taskId, authorId)?.id ?? null;

// Where the app's own events reach agents: webhooks for external agents, queued runs for the
// built-in runner. Only people start runs; an agent's comment or assignment never wakes another
// agent's runner, so two agents can't keep each other busy forever. Webhooks carry the actor's
// kind so external agents can apply the same rule.
const agentEvents = {
  // Called by notify() for every recipient. Agents get notifications like anyone else; these
  // are the ones that mean "something for you to do".
  notified(userId, type, taskId, actorId) {
    if (!taskId || !agentScope.isAgent(userId) || !agentSettings.enabled()) return;
    const task = loadTask(taskId);
    if (!task || task.deletedAt || !canSeeTask(task, { id: userId })) return;
    const actor = person(actorId);
    const byPerson = actor?.kind === 'human';
    const base = { task: taskRef(task), actor: actorOut(actor) };

    if (type === 'assigned') {
      enqueueDelivery(userId, 'task.assigned', base);
      if (byPerson) enqueueRun({ agentId: userId, taskId, trigger: 'assigned', actingFor: actorId });
    } else if (type === 'mention' || type === 'comment') {
      const commentId = latestComment(taskId, actorId);
      enqueueDelivery(userId, 'comment.created', { ...base, comment: { id: commentId }, mentioned: type === 'mention', watching: type === 'comment' });
      // a plain comment only wakes the runner on work that's the agent's own
      if (byPerson && (type === 'mention' || task.assigneeId === userId)) enqueueRun({ agentId: userId, taskId, trigger: type, actingFor: actorId, detail: { commentId } });
    }
  },

  // Called with every saved change to a task: agents that own or watch it hear what kind of
  // field changed, not what it changed to.
  taskChanged(task, actorId, changes) {
    if (task.private || !agentSettings.enabled()) return;
    const keys = changes.map((c) => c.key).filter((k) => k !== 'position' && k !== 'sealed');
    if (!keys.length) return;
    const watching = sql.all("SELECT w.user_id FROM watchers w JOIN users u ON u.id = w.user_id WHERE w.task_id = ? AND u.kind = 'agent'", task.id).map((r) => r.user_id);
    const owners = new Set([...watching, ...(agentScope.isAgent(task.assigneeId) ? [task.assigneeId] : [])]);
    const actor = person(actorId);
    for (const agentId of owners) {
      if (agentId === actorId || !canSeeTask(task, { id: agentId })) continue;
      enqueueDelivery(agentId, 'task.updated', { task: taskRef(task), actor: actorOut(actor), changes: keys });
    }
  },
};

export default agentEvents;
