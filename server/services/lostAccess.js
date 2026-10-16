import sql from '../db/sql.js';
import loadTask from './loadTask.js';
import canSeeTask from './canSeeTask.js';

// What someone keeps about a task once they can no longer open it: nothing. Watching it would
// keep sending its new title and status, and old notifications quote its title. Runs when a task
// changes hands, turns private or moves projects, and when a guest's projects or role change.
const TABLES = ['watchers', 'notifications', 'focus'];

function clear(taskId, userId) {
  for (const table of TABLES) sql.run(`DELETE FROM ${table} WHERE task_id = ? AND user_id = ?`, taskId, userId);
}

const lostAccess = {
  task(taskId) {
    const task = loadTask(taskId);
    if (!task) return;
    const holders = new Set(TABLES.flatMap((table) => sql.all(`SELECT DISTINCT user_id FROM ${table} WHERE task_id = ?`, taskId).map((r) => r.user_id)));
    for (const userId of holders) if (!canSeeTask(task, { id: userId })) clear(taskId, userId);
  },

  user(userId) {
    const tasks = new Set(TABLES.flatMap((table) => sql.all(`SELECT DISTINCT task_id FROM ${table} WHERE user_id = ? AND task_id IS NOT NULL`, userId).map((r) => r.task_id)));
    for (const taskId of tasks) if (!canSeeTask(loadTask(taskId), { id: userId })) clear(taskId, userId);
  },

  // after a project is deleted its tasks have no project, so guests lose them
  guests() {
    for (const { id } of sql.all("SELECT id FROM users WHERE role = 'guest'")) lostAccess.user(id);
  },
};

export default lostAccess;
