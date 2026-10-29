import api from '../lib/api.mjs';
import atHour from '../lib/atHour.mjs';

const FOCUS = ['Security review of the key backup flow', 'Decide the 2.0 launch date', 'Interview loop for the senior mobile role'];
// [days from today, hour, hours spent, task]
const LOG = [
  [-9, 9, 2.5, 'Write the 2.0 product brief'], [-9, 14, 1.5, 'Interview loop for the senior mobile role'], [-8, 10, 3, 'Security review of the key backup flow'], [-7, 9, 1, 'October expense report'],
  [-7, 13, 2, 'Interview loop for the senior mobile role'], [-6, 9, 2, 'Decide the 2.0 launch date'], [-6, 15, 1.5, 'Quarterly board update'], [-3, 10, 2.5, 'Security review of the key backup flow'],
  [-2, 9, 1, 'Offer letter for the mobile hire'], [-2, 11, 2, 'Interview loop for the senior mobile role'], [-1, 9, 3, 'Quarterly board update'], [-1, 14, 1.5, 'Decide the 2.0 launch date'],
];

// Ada's own corner: three tasks in My Day, two reminders, and two weeks of tracked time.
export default async function myDay({ pages }, { task, done }) {
  const ada = pages.ada;
  for (const title of FOCUS) await api(ada, 'POST', '/focus', { taskId: task[title].id });
  await api(ada, 'POST', '/reminders', { remindAt: atHour(1, 9), note: 'Send the board update draft to Dev', taskId: task['Quarterly board update'].id });
  await api(ada, 'POST', '/reminders', { remindAt: atHour(2, 14), note: 'Read the TestFlight feedback' });
  for (const [day, hour, hours, title] of LOG) {
    const start = atHour(day, hour);
    const taskId = (task[title] ?? done.find((d) => d.title === title))?.id;
    await api(ada, 'POST', '/time', { startedAt: start, endedAt: start + hours * 3_600_000, taskId, note: '' });
  }
}
