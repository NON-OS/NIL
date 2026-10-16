import './helpers/resolveTs.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { default: parseQuickAdd } = await import('../src/lib/parseQuickAdd.ts');
const { default: recurrenceRule } = await import('../src/lib/recurrenceRule.ts');

// Friday, October 16, 2026, at 10:00
const ctx = {
  users: [
    { id: 'u1', name: 'Erik Lind' },
    { id: 'u2', name: 'Ana Silva' },
  ],
  projects: [{ id: 'p1', name: 'Website', key: 'WEB' }],
  labels: [{ id: 'l1', name: 'bug' }],
  meId: 'u1',
  today: '2026-10-16',
  now: '10:00',
} as unknown as Parameters<typeof parseQuickAdd>[1];

const parse = (text: string, extra: Partial<typeof ctx> = {}) => parseQuickAdd(text, { ...ctx, ...extra });
const pick = (text: string, extra: Partial<typeof ctx> = {}) => {
  const p = parse(text, extra);
  return { title: p.title, dueDate: p.dueDate, dueTime: p.dueTime, recurrence: p.recurrence };
};

test('everything it understood before still works', () => {
  const p = parse('Fix login tomorrow !high #bug +web @me every week');
  assert.deepEqual(
    { title: p.title, dueDate: p.dueDate, priority: p.priority, labels: p.labels, projectId: p.projectId, assigneeId: p.assigneeId, recurrence: p.recurrence },
    { title: 'Fix login', dueDate: '2026-10-17', priority: 3, labels: ['l1'], projectId: 'p1', assigneeId: 'u1', recurrence: 'weekly' },
  );
  assert.equal(parse('Sun damage report').dueDate, undefined);
  assert.equal(parse('Review deck by fri').dueDate, '2026-10-23');
  assert.equal(parse('Launch oct 20').dueDate, '2026-10-20');
  assert.equal(parse('Close the books eom').dueDate, '2026-10-31');
  assert.equal(parse('Prep next week').dueDate, '2026-10-19');
  assert.equal(parse('Standup every weekday').recurrence, 'weekdays');
});

test('times: "at 3pm", "5pm", "15:30" and "noon"', () => {
  assert.deepEqual(pick('Call Ana at 3pm'), { title: 'Call Ana', dueDate: '2026-10-16', dueTime: '15:00', recurrence: undefined });
  assert.equal(pick('Standup 5pm').dueTime, '17:00');
  assert.equal(pick('Standup 5 pm').dueTime, '17:00');
  assert.equal(pick('Drinks 5:30pm').dueTime, '17:30');
  assert.equal(pick('Drinks 6 p.m.').dueTime, '18:00');
  assert.equal(pick('Server patch 12am').dueTime, '00:00');
  assert.equal(pick('Lunch 12pm').dueTime, '12:00');
  assert.deepEqual(pick('Review the draft 15:30'), { title: 'Review the draft', dueDate: '2026-10-16', dueTime: '15:30', recurrence: undefined });
  assert.equal(pick('Pick up keys at 9:05').dueTime, '09:05');
  assert.deepEqual(pick('Lunch with Sam at noon tomorrow'), { title: 'Lunch with Sam', dueDate: '2026-10-17', dueTime: '12:00', recurrence: undefined });
  assert.equal(pick('Send it by 4pm').title, 'Send it');
  // a bare hour after "at": 1 to 6 are afternoon, 7 to 11 morning, 13 and up as written
  assert.equal(pick('Ship it at 5').dueTime, '17:00');
  assert.equal(pick('Gym at 7').dueTime, '07:00');
  assert.equal(pick('Board call at 14').dueTime, '14:00');
});

test('a time alone means the next time the clock shows it', () => {
  assert.equal(pick('Call Ana at 3pm').dueDate, '2026-10-16');
  assert.equal(pick('Call Ana at 9am').dueDate, '2026-10-17');
  assert.equal(pick('Call Ana at 9am', { now: undefined }).dueDate, '2026-10-16');
  assert.deepEqual(pick('Dentist monday at 8:30'), { title: 'Dentist', dueDate: '2026-10-19', dueTime: '08:30', recurrence: undefined });
});

test('numbers that aren’t times stay in the title', () => {
  for (const text of ['Buy 2 eggs', 'Fix 404 page', 'Read at home', 'Room 101 cleanup', 'Grow signups 5% at launch', 'Ratio of 3 to 4', 'Plan for at 5 days']) {
    const p = parse(text);
    assert.equal(p.dueTime, undefined, text);
    assert.equal(p.title, text);
  }
});

test('days of the month and "in 2 weeks"', () => {
  assert.deepEqual(pick('Pay rent on the 1st'), { title: 'Pay rent', dueDate: '2026-11-01', dueTime: undefined, recurrence: undefined });
  assert.equal(pick('Send invoice on the 16th').dueDate, '2026-10-16');
  assert.equal(pick('Send invoice by the 20th').dueDate, '2026-10-20');
  assert.equal(pick('File taxes due 3rd').dueDate, '2026-11-03');
  assert.equal(pick('Archive on the 31st').dueDate, '2026-10-31');
  // a month too short for the day gives its last day
  assert.equal(pick('Archive on the 31st', { today: '2026-11-16' }).dueDate, '2026-11-30');
  assert.equal(pick('Renew passport in 2 weeks').dueDate, '2026-10-30');
  assert.equal(pick('Renew passport in two weeks').title, 'Renew passport');
  assert.equal(pick('Renew passport in two weeks').dueDate, '2026-10-30');
  assert.equal(pick('Follow up in a week').dueDate, '2026-10-23');
  assert.equal(pick('Check in 3 days').dueDate, '2026-10-19');
  assert.equal(pick('Review in a month').dueDate, '2026-11-16');
  assert.equal(pick('Renew domain in 1 year').dueDate, '2027-10-16');
  assert.equal(pick('Plan the trip next month').dueDate, '2026-11-16');
});

test('repeats: "every 3 days", "every other week", "every month on the 15th"', () => {
  assert.deepEqual(pick('Water the plants every 3 days'), { title: 'Water the plants', dueDate: undefined, dueTime: undefined, recurrence: 'FREQ=DAILY;INTERVAL=3' });
  assert.equal(pick('Report every other week').recurrence, 'biweekly');
  assert.equal(pick('Report every 2 weeks').recurrence, 'biweekly');
  assert.equal(pick('Stretch every other day').recurrence, 'FREQ=DAILY;INTERVAL=2');
  assert.equal(pick('Dentist every 6 months').recurrence, 'FREQ=MONTHLY;INTERVAL=6');
  assert.equal(pick('Review goals every three weeks').recurrence, 'FREQ=WEEKLY;INTERVAL=3');
  assert.equal(pick('Birthday card every year').recurrence, 'FREQ=YEARLY');
  assert.deepEqual(pick('Pay rent every month on the 15th'), { title: 'Pay rent', dueDate: '2026-11-15', dueTime: undefined, recurrence: 'FREQ=MONTHLY;BYMONTHDAY=15' });
  assert.deepEqual(pick('Payroll monthly on the 16th'), { title: 'Payroll', dueDate: '2026-10-16', dueTime: undefined, recurrence: 'FREQ=MONTHLY;BYMONTHDAY=16' });
  assert.deepEqual(pick('Back up every 1st'), { title: 'Back up', dueDate: '2026-11-01', dueTime: undefined, recurrence: 'FREQ=MONTHLY;BYMONTHDAY=1' });
  assert.deepEqual(pick('Close the month every month on the last day'), { title: 'Close the month', dueDate: '2026-10-31', dueTime: undefined, recurrence: 'FREQ=MONTHLY;BYMONTHDAY=-1' });
  assert.deepEqual(pick('Team sync every monday at 10:30'), { title: 'Team sync', dueDate: '2026-10-19', dueTime: '10:30', recurrence: 'weekly' });
  assert.equal(pick('Review every friday').dueDate, '2026-10-16');
  // a date typed out wins over the one a repeat implies
  assert.equal(pick('Pay rent every month on the 15th starting nov 20').dueDate, '2026-11-20');
});

test('the parsed pieces are marked so the box can show what it understood', () => {
  const p = parse('Call Ana tomorrow at 3pm every week');
  assert.deepEqual(p.tokens.map((t) => [t.kind, t.text]), [['date', 'tomorrow'], ['time', 'at 3pm'], ['repeat', 'every week']]);
  assert.equal(p.title, 'Call Ana');
});

test('repeat rules read as plain words', () => {
  assert.equal(recurrenceRule.describe('FREQ=DAILY;INTERVAL=3'), 'Every 3 days');
  assert.equal(recurrenceRule.describe('FREQ=MONTHLY;BYMONTHDAY=15'), 'Every month on the 15th');
  assert.equal(recurrenceRule.describe('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=-1'), 'Every 2 months on the last day');
  assert.equal(recurrenceRule.describe('FREQ=YEARLY'), 'Every year');
  assert.equal(recurrenceRule.describe('biweekly'), 'Every 2 weeks');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(recurrenceRule.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st']);
  assert.equal(recurrenceRule.format({ freq: 'WEEKLY', interval: 2, monthDay: null }), 'biweekly');
});
