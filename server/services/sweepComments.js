import sql from '../db/sql.js';
import withoutSearchTriggers from '../db/withoutSearchTriggers.js';
import commentQuotes from './commentQuotes.js';

// One batch of the comment retention sweep: up to `limit` comments older than `cutoff` go, in
// one transaction with everything that follows from it. Each task they were on gets its count
// and its search index row brought up to date once (setting `number` to itself fires the index
// trigger), and loses the quotes of them in notifications and agent briefings.
export default function sweepComments(cutoff, limit) {
  return sql.tx(() => {
    const rows = sql.all('SELECT id, task_id FROM comments WHERE created_at < ? LIMIT ?', cutoff, limit);
    if (!rows.length) return 0;
    withoutSearchTriggers(() => {
      for (const { id } of rows) sql.run('DELETE FROM comments WHERE id = ?', id);
    });
    const touched = [...new Set(rows.map((r) => r.task_id))];
    for (const id of touched) sql.run('UPDATE tasks SET number = number, comment_count = (SELECT COUNT(*) FROM comments WHERE task_id = ?) WHERE id = ?', id, id);
    commentQuotes.swept(touched, cutoff);
    return rows.length;
  });
}
