import sql from '../db/sql.js';

const EXCERPT = 140;
const GONE = '(changed or removed since)';

// A comment as a built-in agent's briefing quotes it. Its text can't contain the closing tag,
// which the briefing escapes, so the first one after the opening line ends it; a briefing cut
// off at the log's length limit may end inside one.
const BLOCK = /(<comment id="([\w-]+)"[^\n]*>\n)([\s\S]*?)(\n<\/comment>|$)/g;

// Takes out of the briefings for runs on a task every quoted comment `keep` says no to.
function scrubBriefings(taskId, keep) {
  const steps = sql.all("SELECT run_id, seq, output FROM agent_steps WHERE kind = 'brief' AND run_id IN (SELECT id FROM agent_runs WHERE task_id = ?)", taskId);
  for (const step of steps) {
    const output = String(step.output ?? '').replace(BLOCK, (all, open, id, body, close) => (keep(id) ? all : `${open}${GONE}${close}`));
    if (output !== step.output) sql.run('UPDATE agent_steps SET output = ? WHERE run_id = ? AND seq = ?', output, step.run_id, step.seq);
  }
}

// Notifications about this comment. Older ones don't name it, so they're found by who wrote it
// and the words they quote.
const ABOUT = `task_id = ? AND type IN ('mention', 'comment') AND (json_extract(data, '$.commentId') = ?
  OR (json_extract(data, '$.commentId') IS NULL AND actor_id IS ? AND json_extract(data, '$.excerpt') = ?))`;
const about = (comment) => [comment.task_id, comment.id, comment.author_id, String(comment.body).slice(0, EXCERPT)];

// Where a comment's words get copied: the excerpt in people's notifications and the briefing a
// built-in agent was given. When the comment is edited, deleted or erased by the retention
// policy, the copies follow it.
const commentQuotes = {
  excerpt: (body) => body.slice(0, EXCERPT),

  edited(comment, body) {
    if (!comment.sealed) sql.run(`UPDATE notifications SET data = json_set(data, '$.excerpt', ?) WHERE ${ABOUT} AND json_extract(data, '$.excerpt') IS NOT NULL`, body.slice(0, EXCERPT), ...about(comment));
    scrubBriefings(comment.task_id, (id) => id !== comment.id);
  },

  removed(comment) {
    sql.run(`UPDATE notifications SET data = json_remove(data, '$.excerpt') WHERE ${ABOUT}`, ...about(comment));
    scrubBriefings(comment.task_id, (id) => id !== comment.id);
  },

  // After the retention sweep erased comments older than `cutoff` on these tasks. A notification
  // comes right after its comment, so one older than the cutoff quotes an erased comment too.
  // Only these tasks are looked at: every sweep before this one cleaned up after its own.
  swept(taskIds, cutoff) {
    for (const taskId of taskIds) {
      sql.run(
        `UPDATE notifications SET data = json_remove(data, '$.excerpt') WHERE task_id = ? AND type IN ('mention', 'comment') AND json_extract(data, '$.excerpt') IS NOT NULL
         AND (created_at < ? OR json_extract(data, '$.commentId') NOT IN (SELECT id FROM comments WHERE task_id = ?))`,
        taskId,
        cutoff,
        taskId,
      );
      const left = new Set(sql.all('SELECT id FROM comments WHERE task_id = ?', taskId).map((r) => r.id));
      scrubBriefings(taskId, (id) => left.has(id));
    }
  },
};

export default commentQuotes;
