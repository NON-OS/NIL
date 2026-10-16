import sql from '../db/sql.js';
import guestScope from '../services/guestScope.js';
import visibleSql from '../services/visibleSql.js';
import agentScope from './agentScope.js';

// Whom someone working inside a few projects may know about: the admins, themselves, and the
// people on the tasks they can see. The guest rule, applied to project-scoped agents too.
// Null means everyone in the workspace.
export default function visiblePeople(user) {
  const agent = agentScope.of(user.id);
  if (!guestScope.of(user.id) && (!agent || agent.all)) return null;
  const visible = visibleSql(user.id, 't');
  const people = new Set([user.id, ...sql.all("SELECT id FROM users WHERE role IN ('owner', 'admin')").map((u) => u.id)]);
  for (const t of sql.all(`SELECT t.assignee_id, t.creator_id FROM tasks t WHERE t.deleted_at IS NULL AND ${visible.where}`, ...visible.params)) {
    if (t.assignee_id) people.add(t.assignee_id);
    if (t.creator_id) people.add(t.creator_id);
  }
  return people;
}
