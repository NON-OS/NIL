import sql from '../db/sql.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import toComment from '../mappers/toComment.js';
import visibleTask from './visibleTask.js';
import toTaskViewers from './toTaskViewers.js';
import publishTask from './publishTask.js';
import watchers from './watchers.js';
import logActivity from './logActivity.js';
import findMentions from './findMentions.js';
import notify from './notify.js';

// Posts a comment as `actor`: from the app or from a connected AI assistant, same rules.
export default function addComment(actor, taskId, text) {
  const task = visibleTask(taskId, actor);
  const body = check.text(text, 'Comment', { min: 1, max: 10_000 });
  const id = newId();
  sql.run('INSERT INTO comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', id, task.id, actor.id, body, Date.now());
  const comment = toComment(sql.get('SELECT * FROM comments WHERE id = ?', id));
  toTaskViewers(task.id, { type: 'comment', comment });

  watchers.add(task.id, actor.id);
  logActivity(task.id, actor.id, 'comment', { commentId: id });

  const mentioned = findMentions(body);
  const preview = { title: task.title, excerpt: body.slice(0, 140) };
  notify(mentioned, 'mention', task.id, actor.id, preview);
  notify([...watchers.of(task.id), task.assigneeId].filter((u) => !mentioned.includes(u)), 'comment', task.id, actor.id, preview);
  for (const userId of mentioned) watchers.add(task.id, userId);

  sql.run('UPDATE tasks SET comment_count = (SELECT COUNT(*) FROM comments WHERE task_id = ?) WHERE id = ?', task.id, task.id);
  publishTask(task.id);
  return comment;
}
