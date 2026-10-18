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
import canSeeTask from './canSeeTask.js';
import cipherText from '../lib/cipherText.js';
import HttpError from '../lib/HttpError.js';
import commentQuotes from './commentQuotes.js';

// Posts a comment as `actor`: from the app or from a connected AI assistant, same rules.
// On an encrypted private task the comment arrives encrypted too, and the server never
// learns what it says, so it can't look for mentions or quote it in a notification.
export default function addComment(actor, taskId, text, { sealed = false } = {}) {
  const task = visibleTask(taskId, actor);
  if (Boolean(task.sealed) !== Boolean(sealed)) {
    throw HttpError.badRequest(task.sealed ? 'This task is encrypted, so comments on it are encrypted too. Comment in Nil.' : 'Only comments on private tasks are encrypted.');
  }
  const body = sealed ? cipherText(text, 'Encrypted comment', { max: 60_000 }) : check.text(text, 'Comment', { min: 1, max: 10_000 });
  const id = newId();
  // the comment, its count, its history entry and its notifications are saved together
  const comment = sql.tx(() => {
    sql.run('INSERT INTO comments (id, task_id, author_id, body, sealed, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, task.id, actor.id, body, sealed ? 1 : 0, Date.now());
    const saved = toComment(sql.get('SELECT * FROM comments WHERE id = ?', id));
    toTaskViewers(task.id, { type: 'comment', comment: saved });

    watchers.add(task.id, actor.id);
    logActivity(task.id, actor.id, 'comment', { commentId: id });

    // a mention of someone who can't open the task neither tells them about it nor lets them in
    const mentioned = sealed ? [] : findMentions(body).filter((userId) => canSeeTask(task, { id: userId }));
    // the comment's id lets the excerpt follow an edit or a delete
    const preview = sealed ? {} : { title: task.title, excerpt: commentQuotes.excerpt(body), commentId: id };
    notify(mentioned, 'mention', task.id, actor.id, preview);
    notify([...watchers.of(task.id), task.assigneeId].filter((u) => !mentioned.includes(u)), 'comment', task.id, actor.id, preview);
    for (const userId of mentioned) watchers.add(task.id, userId);

    sql.run('UPDATE tasks SET comment_count = (SELECT COUNT(*) FROM comments WHERE task_id = ?) WHERE id = ?', task.id, task.id);
    return saved;
  });
  publishTask(task.id);
  return comment;
}
