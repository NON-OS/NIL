import icsLine from './icsLine.js';

const stamp = (ts) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const day = (date) => date.replace(/-/g, '');
const nextDay = (date) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

// One task as a calendar event. A task with a time is a moment in UTC; one with only a date is
// an all-day event, which calendars show on that day wherever the reader is. A private task is
// only "Private task" at its due date: no title, link, key or project.
export default function taskEvent(task, { host, now, appUrl, prefix, projectName }) {
  const lines = ['BEGIN:VEVENT', icsLine('UID', `${task.id}@${host}`), icsLine('DTSTAMP', stamp(now))];
  if (task.dueAt) lines.push(icsLine('DTSTART', stamp(task.dueAt)));
  else lines.push(icsLine('DTSTART;VALUE=DATE', day(task.dueDate)), icsLine('DTEND;VALUE=DATE', day(nextDay(task.dueDate))));

  if (task.private) {
    lines.push(icsLine('SUMMARY', 'Private task', { text: true }), 'CLASS:PRIVATE');
  } else {
    const link = `${appUrl}/?task=${task.number}`;
    lines.push(
      icsLine('SUMMARY', task.title, { text: true }),
      icsLine('DESCRIPTION', [`${prefix}-${task.number}`, projectName, link].filter(Boolean).join('\n'), { text: true }),
      icsLine('URL', link),
    );
  }
  lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  return lines;
}
