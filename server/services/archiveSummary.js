import sql from '../db/sql.js';
import visibleSql from './visibleSql.js';
import archivedSql from './archivedSql.js';

// What someone's archive holds, in numbers: how many archived tasks each goal and project has
// done, so progress counts finished work the browser hasn't loaded. With `labels`, how many
// archived tasks carry each label as well.
export default function archiveSummary(viewerId, before, { labels = false } = {}) {
  const visible = visibleSql(viewerId);
  const archived = archivedSql(before);
  const where = `tasks.deleted_at IS NULL AND ${archived.where} AND ${visible.where}`;
  const params = [...archived.params, ...visible.params];

  const done = { goals: {}, projects: {} };
  const counts = sql.all(`SELECT goal_id, project_id, COUNT(*) AS n FROM tasks WHERE ${where} AND tasks.status = 'done' GROUP BY goal_id, project_id`, ...params);
  for (const row of counts) {
    if (row.goal_id) done.goals[row.goal_id] = (done.goals[row.goal_id] ?? 0) + row.n;
    if (row.project_id) done.projects[row.project_id] = (done.projects[row.project_id] ?? 0) + row.n;
  }
  if (!labels) return { done };

  const tagged = sql.all(`SELECT label.value AS id, COUNT(*) AS n FROM tasks, json_each(tasks.labels) AS label WHERE ${where} GROUP BY label.value`, ...params);
  return { done, labels: Object.fromEntries(tagged.map((row) => [row.id, row.n])) };
}
