import sql from '../db/sql.js';

const watchers = {
  add(taskId, userId) {
    if (userId) sql.run('INSERT OR IGNORE INTO watchers (task_id, user_id) VALUES (?, ?)', taskId, userId);
  },

  remove(taskId, userId) {
    sql.run('DELETE FROM watchers WHERE task_id = ? AND user_id = ?', taskId, userId);
  },

  of(taskId) {
    return sql.all('SELECT user_id FROM watchers WHERE task_id = ?', taskId).map((r) => r.user_id);
  },
};

export default watchers;
