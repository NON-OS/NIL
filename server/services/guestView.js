import sql from '../db/sql.js';
import visibleSql from './visibleSql.js';

// What a guest's app is built from: their projects, the goals and people on the tasks they
// can see, and the admins (so they know whom to ask). Nothing else about the workspace.
export default function guestView(guestId, scope) {
  const visible = visibleSql(guestId, 't');
  const tasks = sql.all(`SELECT t.* FROM tasks t WHERE t.deleted_at IS NULL AND ${visible.where}`, ...visible.params);
  const people = new Set([guestId, ...sql.all("SELECT id FROM users WHERE role IN ('owner', 'admin')").map((u) => u.id)]);
  for (const t of tasks) {
    if (t.assignee_id) people.add(t.assignee_id);
    if (t.creator_id) people.add(t.creator_id);
  }
  return {
    tasks,
    people,
    projects: [...scope],
    goals: new Set(tasks.map((t) => t.goal_id).filter(Boolean)),
  };
}
