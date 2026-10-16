import dates from './dates';
import recurrenceRule from './recurrenceRule';
import type User from '../types/User';
import type Project from '../types/Project';
import type Label from '../types/Label';
import type Priority from '../types/Priority';
import type Recurrence from '../types/Recurrence';

interface Context {
  users: User[];
  projects: Project[];
  labels: Label[];
  meId: string | null;
  today: string;
  // the time now, 'HH:MM'; a time typed without a day that has already passed means tomorrow
  now?: string;
}

interface Token {
  start: number;
  end: number;
  kind: 'date' | 'time' | 'priority' | 'label' | 'project' | 'assignee' | 'repeat';
  text: string;
}

interface Parsed {
  title: string;
  dueDate?: string;
  dueTime?: string;
  priority?: Priority;
  labels: string[];
  projectId?: string;
  assigneeId?: string;
  recurrence?: Recurrence;
  tokens: Token[];
}

type Match = [RegExpExecArray, string];

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const PREFIX = '(?:(?:due|by|on)\\s+)?';
const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const COUNT = '(\\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const WEEKDAY = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday)';
const ORDINAL = '(\\d{1,2})(?:st|nd|rd|th)';
const UNITS = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' } as const;

const PRIORITY: Record<string, Priority> = {
  '!urgent': 4, '!u': 4, p1: 4, '!high': 3, '!h': 3, p2: 3,
  '!medium': 2, '!med': 2, '!m': 2, p3: 2, '!low': 1, '!l': 1, p4: 1,
};

const count = (word: string) => NUMBERS[word.toLowerCase()] ?? Number(word);
const pad = (n: number) => String(n).padStart(2, '0');
const unit = (word: string) => UNITS[word.toLowerCase().replace(/s$/, '') as keyof typeof UNITS];

function nextWeekday(today: string, target: number) {
  const diff = (target - dates.parse(today).getDay() + 7) % 7 || 7;
  return dates.addDays(today, diff);
}

function monthDay(today: string, month: number, day: number) {
  const year = Number(today.slice(0, 4));
  const pick = (y: number) => `${y}-${pad(month + 1)}-${pad(day)}`;
  const candidate = pick(year);
  return candidate < today ? pick(year + 1) : candidate;
}

// The next date that falls on `day` of a month, today included. A month too short for it gives
// its last day, so "the 31st" in April is April 30.
function dayOfMonth(today: string, day: number) {
  const thisMonth = `${today.slice(0, 8)}${pad(Math.min(day, Number(dates.monthEnd(today).slice(8))))}`;
  if (thisMonth >= today) return thisMonth;
  const next = dates.addMonths(dates.monthStart(today), 1);
  return `${next.slice(0, 8)}${pad(Math.min(day, Number(dates.monthEnd(next).slice(8))))}`;
}

const run = (re: RegExp, fn: (m: RegExpExecArray) => string | null) => (s: string): Match | null => {
  const m = re.exec(s);
  const value = m && fn(m);
  return m && value ? [m, value] : null;
};

// Each repeat matcher gives the rule and, when the words name a day, the first due date.
function repeatMatchers(today: string): Array<(s: string) => { m: RegExpExecArray; value: Recurrence; date?: string } | null> {
  const rule = (re: RegExp, fn: (m: RegExpExecArray) => { value: Recurrence; date?: string } | null) => (s: string) => {
    const m = re.exec(s);
    const hit = m && fn(m);
    return m && hit ? { m, ...hit } : null;
  };
  const monthly = (day: number) => (day >= 1 && day <= 31 ? { value: recurrenceRule.format({ freq: 'MONTHLY', interval: 1, monthDay: day }), date: dayOfMonth(today, day) } : null);
  return [
    rule(/\b(every\s+weekday|weekdays)\b/i, () => ({ value: 'weekdays' })),
    rule(new RegExp(`\\b(?:every\\s+month|monthly)\\s+on\\s+the\\s+last\\s+day\\b`, 'i'), () => ({ value: recurrenceRule.format({ freq: 'MONTHLY', interval: 1, monthDay: -1 }), date: dates.monthEnd(today) })),
    rule(new RegExp(`\\b(?:every\\s+month|monthly)\\s+on\\s+the\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (m) => monthly(Number(m[1]))),
    rule(new RegExp(`\\bevery\\s+${ORDINAL}\\b`, 'i'), (m) => monthly(Number(m[1]))),
    rule(/\bevery\s+other\s+(day|week|month|year)\b/i, (m) => ({ value: recurrenceRule.format({ freq: unit(m[1]), interval: 2, monthDay: null }) })),
    rule(new RegExp(`\\bevery\\s+${COUNT}\\s+(days|weeks|months|years)\\b`, 'i'), (m) => {
      const n = count(m[1]);
      return n >= 1 && n <= 365 ? { value: recurrenceRule.format({ freq: unit(m[2]), interval: n, monthDay: null }) } : null;
    }),
    rule(new RegExp(`\\bevery\\s+${WEEKDAY}\\b`, 'i'), (m) => ({ value: 'weekly', date: nextWeekday(dates.addDays(today, -1), DAY_NAMES[m[1].toLowerCase()]) })),
    rule(/\bbiweekly\b/i, () => ({ value: 'biweekly' })),
    rule(/\b(every\s+day|daily)\b/i, () => ({ value: 'daily' })),
    rule(/\b(every\s+week|weekly)\b/i, () => ({ value: 'weekly' })),
    rule(/\b(every\s+month|monthly)\b/i, () => ({ value: 'monthly' })),
    rule(/\b(every\s+year|yearly|annually)\b/i, () => ({ value: recurrenceRule.format({ freq: 'YEARLY', interval: 1, monthDay: null }) })),
  ];
}

// Each matcher returns [match, 'HH:MM'] or null.
function timeMatchers(): Array<(s: string) => Match | null> {
  const AT = '(?:(?:at|by|before)\\s+)?';
  return [
    run(new RegExp(`\\b${AT}(noon|midday)\\b`, 'i'), () => '12:00'),
    run(new RegExp(`\\b${AT}(\\d{1,2})(?::([0-5]\\d))?\\s*([ap])\\.?m\\b\\.?`, 'i'), (m) => {
      const hour = Number(m[1]);
      if (hour < 1 || hour > 12) return null;
      return `${pad((hour % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0))}:${m[2] ?? '00'}`;
    }),
    run(new RegExp(`\\b${AT}([01]?\\d|2[0-3]):([0-5]\\d)\\b`, 'i'), (m) => `${pad(Number(m[1]))}:${m[2]}`),
    // "at 5" on its own: nobody plans tasks for 5 in the morning, so 1 to 6 mean afternoon
    run(/\bat\s+(\d{1,2})\b(?![:.]\d|\s*%|\s*(?:st|nd|rd|th|days?|weeks?|months?|years?)\b)/i, (m) => {
      const hour = Number(m[1]);
      if (hour > 23) return null;
      return `${pad(hour >= 1 && hour <= 6 ? hour + 12 : hour)}:00`;
    }),
  ];
}

// Each matcher returns [match, isoDate] or null.
function dateMatchers(today: string): Array<(s: string) => Match | null> {
  return [
    run(new RegExp(`\\b${PREFIX}(\\d{4}-\\d{2}-\\d{2})\\b`, 'i'), (m) => (Number.isNaN(Date.parse(m[1])) ? null : m[1])),
    run(new RegExp(`\\b${PREFIX}(today|tonight|tod)\\b`, 'i'), () => today),
    run(new RegExp(`\\b${PREFIX}(tomorrow|tmrw?|tmr)\\b`, 'i'), () => dates.addDays(today, 1)),
    run(/\bnext\s+week\b/i, () => nextWeekday(today, 1)),
    run(/\bnext\s+month\b/i, () => dates.addMonths(today, 1)),
    run(/\b(eow|end\s+of\s+(?:the\s+)?week)\b/i, () => nextWeekday(dates.addDays(today, -1), 5)),
    run(/\b(eom|end\s+of\s+(?:the\s+)?month)\b/i, () => dates.monthEnd(today)),
    run(new RegExp(`\\bin\\s+${COUNT}\\s+(days?|weeks?|months?|years?)\\b`, 'i'), (m) => {
      const n = count(m[1]);
      if (m[2].startsWith('year')) return dates.addMonths(today, n * 12);
      if (m[2].startsWith('month')) return dates.addMonths(today, n);
      return dates.addDays(today, m[2].startsWith('week') ? n * 7 : n);
    }),
    // short day names only count with a prefix, so "Sun damage report" stays a title
    run(/\b(?:due|by|on|next)\s+(sun|mon|tues?|wed|weds|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?\b/i, (m) => nextWeekday(today, DAY_NAMES[m[1].toLowerCase()])),
    run(new RegExp(`\\b${WEEKDAY}\\b`, 'i'), (m) => nextWeekday(today, DAY_NAMES[m[1].toLowerCase()])),
    run(new RegExp(`\\b${PREFIX}${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (m) => {
      const day = Number(m[2]);
      return day >= 1 && day <= 31 ? monthDay(today, MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase()), day) : null;
    }),
    run(new RegExp(`\\b${PREFIX}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\b`, 'i'), (m) => {
      const day = Number(m[1]);
      return day >= 1 && day <= 31 ? monthDay(today, MONTH_NAMES.indexOf(m[2].slice(0, 3).toLowerCase()), day) : null;
    }),
    // "on the 1st", "by the 15th", "due 3rd": the next time that day of the month comes round
    run(/\b(?:due|by|on)\s+(?:the\s+(\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})(?:st|nd|rd|th))\b/i, (m) => {
      const day = Number(m[1] ?? m[2]);
      return day >= 1 && day <= 31 ? dayOfMonth(today, day) : null;
    }),
  ];
}

const squash = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

export default function parseQuickAdd(input: string, ctx: Context): Parsed {
  const out: Parsed = { title: input, labels: [], tokens: [] };
  const taken: Array<[number, number]> = [];
  const free = (start: number, end: number) => taken.every(([a, b]) => end <= a || start >= b);
  const claim = (start: number, end: number, kind: Token['kind']) => {
    taken.push([start, end]);
    out.tokens.push({ start, end, kind, text: input.slice(start, end) });
  };

  let impliedDate: string | undefined;
  for (const match of repeatMatchers(ctx.today)) {
    const hit = match(input);
    if (!hit || !free(hit.m.index, hit.m.index + hit.m[0].length)) continue;
    out.recurrence = hit.value;
    impliedDate = hit.date;
    claim(hit.m.index, hit.m.index + hit.m[0].length, 'repeat');
    break;
  }

  for (const m of input.matchAll(/(^|\s)(![a-z]+|p[1-4])(?=\s|$)/gi)) {
    const value = PRIORITY[m[2].toLowerCase()];
    const start = m.index! + m[1].length;
    if (value !== undefined && out.priority === undefined && free(start, start + m[2].length)) {
      out.priority = value;
      claim(start, start + m[2].length, 'priority');
    }
  }

  for (const m of input.matchAll(/(^|\s)#([\w-]+)/g)) {
    const label = ctx.labels.find((l) => squash(l.name) === squash(m[2]));
    const start = m.index! + m[1].length;
    if (label && !out.labels.includes(label.id)) {
      out.labels.push(label.id);
      claim(start, start + m[2].length + 1, 'label');
    }
  }

  for (const m of input.matchAll(/(^|\s)\+([\w-]+)/g)) {
    const q = squash(m[2]);
    const project =
      ctx.projects.find((p) => p.key.toLowerCase() === q) ??
      ctx.projects.find((p) => squash(p.name) === q) ??
      ctx.projects.find((p) => squash(p.name).startsWith(q));
    if (project && !out.projectId) {
      const start = m.index! + m[1].length;
      out.projectId = project.id;
      claim(start, start + m[2].length + 1, 'project');
    }
  }

  for (const m of input.matchAll(/(^|\s)@([\w.-]+)/g)) {
    const q = squash(m[2]);
    const user =
      q === 'me' ? ctx.users.find((u) => u.id === ctx.meId) : ctx.users.find((u) => squash(u.name) === q) ?? ctx.users.find((u) => squash(u.name.split(' ')[0]) === q);
    if (user && !out.assigneeId) {
      const start = m.index! + m[1].length;
      out.assigneeId = user.id;
      claim(start, start + m[2].length + 1, 'assignee');
    }
  }

  for (const [kind, matchers] of [['time', timeMatchers()], ['date', dateMatchers(ctx.today)]] as const) {
    for (const match of matchers) {
      const hit = match(input);
      if (!hit || !free(hit[0].index, hit[0].index + hit[0][0].length)) continue;
      if (kind === 'time') out.dueTime = hit[1];
      else out.dueDate = hit[1];
      claim(hit[0].index, hit[0].index + hit[0][0].length, kind);
      break;
    }
  }

  out.dueDate ??= impliedDate;
  // a time alone means the next time the clock shows it
  if (out.dueTime && !out.dueDate) out.dueDate = ctx.now && out.dueTime <= ctx.now ? dates.addDays(ctx.today, 1) : ctx.today;

  out.tokens.sort((a, b) => a.start - b.start);
  let title = '';
  let cursor = 0;
  for (const t of out.tokens) {
    title += input.slice(cursor, t.start);
    cursor = t.end;
  }
  out.title = (title + input.slice(cursor)).replace(/\s{2,}/g, ' ').trim();
  return out;
}
