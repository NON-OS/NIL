import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import zonedTime from '../lib/zonedTime.js';

// Turns the due date, time and time zone a request sent into what's stored: the due moment in
// UTC (dueAt) and the zone it was set in (dueTz). Returns only what changes. Moving just the date
// of a task that has a time keeps the time, on the wall clock of the zone it was set in.
export default function resolveDue(taskId, patch) {
  const hasDate = 'dueDate' in patch;
  const hasTime = 'dueTime' in patch;
  if (!hasDate && !hasTime) return {};
  const existing = taskId ? sql.get('SELECT due_date, due_at, due_tz FROM tasks WHERE id = ?', taskId) : null;
  const date = hasDate ? patch.dueDate : existing?.due_date ?? null;

  if (hasTime && patch.dueTime) {
    if (!date) throw HttpError.badRequest('Pick a due date before a time.');
    if (!patch.timeZone) throw HttpError.badRequest('Send your time zone with the due time.');
    return { dueAt: zonedTime.toUtc(date, patch.dueTime, patch.timeZone), dueTz: patch.timeZone };
  }
  if (!date || hasTime) return { dueAt: null, dueTz: null };
  if (existing?.due_at && existing.due_tz) {
    const { time } = zonedTime.wallClock(existing.due_at, existing.due_tz);
    return { dueAt: zonedTime.toUtc(date, time, existing.due_tz), dueTz: existing.due_tz };
  }
  return {};
}
