import sql from '../db/sql.js';
import config from '../config.js';
import agentScope from './agentScope.js';
import NeedsApproval from './NeedsApproval.js';

const minutes = (ms) => Math.round(ms / 60_000);

// People act as themselves through their own keys; nothing extra is asked of them.
const PERSON = Object.freeze({ task() {}, project() {}, assign() {}, destructive() {}, touch() {}, check() {}, done() {} });

// What a write tool must clear before it changes anything when an agent calls it. Each check
// only notes a reason; check() then refuses with all of them at once, so the approval card says
// everything a person is signing off. An approved call runs with the same checks skipped.
export default function toolGuard(agent, { approved = false } = {}) {
  if (!agent) return PERSON;
  const reasons = new Set();
  let subject = null;
  const note = (reason, task) => {
    reasons.add(reason);
    subject ??= task?.id ?? null;
  };

  return {
    task(task) {
      subject ??= task.id;
      if (!agentScope.covers(agent.id, task.projectId)) note('changes a task outside its projects', task);
    },

    project(projectId, task = null) {
      if (!agentScope.covers(agent.id, projectId)) note('puts work in a project outside its scope', task);
    },

    // An agent may take unowned work and hand its own back. Giving work to anyone else, or
    // taking it from a person, is a person's call.
    assign(task, assigneeId) {
      const current = task?.assigneeId ?? null;
      if ((assigneeId ?? null) === current) return;
      if (assigneeId && assigneeId !== agent.id) note('assigns work to someone else', task);
      else if (current && current !== agent.id) note('takes work away from someone else', task);
    },

    destructive(reason, task = null) {
      note(reason, task);
    },

    // One write tool call changes one task; null means a task that doesn't exist yet. Going back
    // to a task already changed in the window doesn't count again.
    touch(taskId) {
      const since = Date.now() - config.agents.bulkWindowMs;
      const recent = new Set(sql.all('SELECT DISTINCT task_id FROM agent_writes WHERE agent_id = ? AND created_at > ?', agent.id, since).map((r) => r.task_id));
      if ((!taskId || !recent.has(taskId)) && recent.size >= config.agents.bulkLimit) {
        note(`changes more than ${config.agents.bulkLimit} tasks within ${minutes(config.agents.bulkWindowMs)} minutes`);
      }
    },

    check() {
      if (reasons.size && !approved) throw new NeedsApproval([...reasons], subject);
    },

    // Counts the change toward the bulk limit once it has happened.
    done(taskId) {
      sql.run('INSERT INTO agent_writes (agent_id, task_id, created_at) VALUES (?, ?, ?)', agent.id, taskId, Date.now());
    },
  };
}
