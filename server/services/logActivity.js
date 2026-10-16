import sql from '../db/sql.js';
import toTaskViewers from './toTaskViewers.js';
import toActivity from '../mappers/toActivity.js';
import actingContext from '../agents/actingContext.js';

export default function logActivity(taskId, actorId, type, data = {}) {
  // an agent's change also names the person it was acting for, when there was one
  const acting = actingContext.current();
  const actingFor = acting?.agentId && acting.agentId === actorId ? acting.actingFor ?? null : null;
  const { lastInsertRowid } = sql.run(
    'INSERT INTO activity (task_id, actor_id, type, data, acting_for, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    taskId,
    actorId,
    type,
    JSON.stringify(data),
    actingFor,
    Date.now(),
  );
  const activity = toActivity(sql.get('SELECT * FROM activity WHERE id = ?', lastInsertRowid));
  toTaskViewers(taskId, { type: 'activity', activity });
  return activity;
}
