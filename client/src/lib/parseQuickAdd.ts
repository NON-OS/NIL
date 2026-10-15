import dates from './dates';
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
}

interface Token {
  start: number;
  end: number;
  kind: 'date' | 'priority' | 'label' | 'project' | 'assignee' | 'repeat';
  text: string;
}

interface Parsed {
  title: string;
  dueDate?: string;
  priority?: Priority;
  labels: string[];
  projectId?: string;
  assigneeId?: string;
  recurrence?: Recurrence;
  tokens: Token[];
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const PREFIX = '(?:(?:due|by|on)\\s+)?';

const REPEAT: [RegExp, Recurrence][] = [
  [/\b(every\s+weekday|weekdays)\b/i, 'weekdays'],
  [/\b(every\s+(?:2|two|other)\s+weeks?|biweekly)\b/i, 'biweekly'],
  [/\b(every\s+day|daily)\b/i, 'daily'],
  [/\b(every\s+week|weekly)\b/i, 'weekly'],
  [/\b(every\s+month|monthly)\b/i, 'monthly'],
];

const PRIORITY: Record<string, Priority> = {
  '!urgent': 4, '!u': 4, p1: 4, '!high': 3, '!h': 3, p2: 3,
  '!medium': 2, '!med': 2, '!m': 2, p3: 2, '!low': 1, '!l': 1, p4: 1,
};

function nextWeekday(today: string, target: number) {
  const diff = (target - dates.parse(today).getDay() + 7) % 7 || 7;
  return dates.addDays(today, diff);
}

function monthDay(today: string, month: number, day: number) {
  const year = Number(today.slice(0, 4));
  const pick = (y: number) => `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const candidate = pick(year);
  return candidate < today ? pick(year + 1) : candidate;
}

// Each matcher returns [match, isoDate] or null.
function dateMatchers(today: string): Array<(s: string) => [RegExpExecArray, string] | null> {
  const run = (re: RegExp, fn: (m: RegExpExecArray) => string | null) => (s: string) => {
    const m = re.exec(s);
    const value = m && fn(m);
    return m && value ? ([m, value] as [RegExpExecArray, string]) : null;
  };
  return [
    run(new RegExp(`\\b${PREFIX}(\\d{4}-\\d{2}-\\d{2})\\b`, 'i'), (m) => (Number.isNaN(Date.parse(m[1])) ? null : m[1])),
    run(new RegExp(`\\b${PREFIX}(today|tonight|tod)\\b`, 'i'), () => today),
    run(new RegExp(`\\b${PREFIX}(tomorrow|tmrw?|tmr)\\b`, 'i'), () => dates.addDays(today, 1)),
    run(/\bnext\s+week\b/i, () => nextWeekday(today, 1)),
    run(/\b(eow|end\s+of\s+(?:the\s+)?week)\b/i, () => nextWeekday(dates.addDays(today, -1), 5)),
    run(/\b(eom|end\s+of\s+(?:the\s+)?month)\b/i, () => dates.monthEnd(today)),
    run(/\bin\s+(\d{1,3})\s+(days?|weeks?|months?)\b/i, (m) => {
      const n = Number(m[1]);
      if (m[2].startsWith('month')) return dates.addMonths(today, n);
      return dates.addDays(today, m[2].startsWith('week') ? n * 7 : n);
    }),
    // short day names only count with a prefix, so "Sun damage report" stays a title
    run(/\b(?:due|by|on|next)\s+(sun|mon|tues?|wed|weds|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?\b/i, (m) => nextWeekday(today, DAY_NAMES[m[1].toLowerCase()])),
    run(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, (m) => nextWeekday(today, DAY_NAMES[m[1].toLowerCase()])),
    run(new RegExp(`\\b${PREFIX}${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (m) => {
      const day = Number(m[2]);
      return day >= 1 && day <= 31 ? monthDay(today, MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase()), day) : null;
    }),
    run(new RegExp(`\\b${PREFIX}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\b`, 'i'), (m) => {
      const day = Number(m[1]);
      return day >= 1 && day <= 31 ? monthDay(today, MONTH_NAMES.indexOf(m[2].slice(0, 3).toLowerCase()), day) : null;
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

  for (const [re, value] of REPEAT) {
    const m = re.exec(input);
    if (m && free(m.index, m.index + m[0].length)) {
      out.recurrence = value;
      claim(m.index, m.index + m[0].length, 'repeat');
      break;
    }
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

  for (const match of dateMatchers(ctx.today)) {
    const hit = match(input);
    if (!hit) continue;
    const [m, value] = hit;
    if (!free(m.index, m.index + m[0].length)) continue;
    out.dueDate = value;
    claim(m.index, m.index + m[0].length, 'date');
    break;
  }

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
