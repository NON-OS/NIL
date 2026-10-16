import sql from '../db/sql.js';
import toTask from '../mappers/toTask.js';
import visibleSql from '../services/visibleSql.js';
import publicWorkspace from '../services/publicWorkspace.js';
import icsLine from './icsLine.js';
import taskEvent from './taskEvent.js';

// Calendar apps keep their own copy, so a cap only stops a runaway feed, not real use.
const MAX_EVENTS = 2000;

// The ICS text of one person's feed: open tasks assigned to them that have a due date.
export default function buildCalendar(userId, { appUrl, now = Date.now() }) {
  const visible = visibleSql(userId);
  const tasks = sql
    .all(
      `SELECT * FROM tasks WHERE assignee_id = ? AND due_date IS NOT NULL AND deleted_at IS NULL AND status NOT IN ('done', 'canceled') AND ${visible.where} ORDER BY due_date LIMIT ?`,
      userId,
      ...visible.params,
      MAX_EVENTS,
    )
    .map(toTask);
  const projects = new Map(sql.all('SELECT id, name FROM projects').map((p) => [p.id, p.name]));
  const ws = publicWorkspace();
  const host = new URL(appUrl).hostname;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NONOS//Nil//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    icsLine('X-WR-CALNAME', ws?.name ? `Nil: ${ws.name}` : 'Nil', { text: true }),
    // a hint for how often to check; apps choose for themselves
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const task of tasks) {
    lines.push(...taskEvent(task, { host, now, appUrl, prefix: ws?.taskPrefix ?? 'NON', projectName: task.private ? null : projects.get(task.projectId) }));
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
