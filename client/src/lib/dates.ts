// Calendar dates travel as local 'YYYY-MM-DD' strings. Noon avoids DST edge cases.
const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type DueState = 'overdue' | 'today' | 'soon' | 'later' | null;

const toISO = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

const today = (): string => toISO(new Date());

function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function addMonths(s: string, n: number): string {
  const d = parse(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toISO(d);
}

const diff = (a: string, b: string): number => Math.round((parse(a).getTime() - parse(b).getTime()) / 86_400_000);

function weekStart(s: string): string {
  const d = parse(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}

const weekEnd = (s: string): string => addDays(weekStart(s), 6);
const monthStart = (s: string): string => `${s.slice(0, 8)}01`;

function monthEnd(s: string): string {
  const d = parse(s);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

// Monday-first weeks covering the whole month.
function monthGrid(s: string): string[][] {
  const weeks: string[][] = [];
  let cursor = weekStart(monthStart(s));
  const last = weekEnd(monthEnd(s));
  while (cursor <= last) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function short(s: string): string {
  const d = parse(s);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${s.slice(0, 4) === today().slice(0, 4) ? '' : `, ${d.getFullYear()}`}`;
}

// "Today", "Tomorrow", "Fri", "Mar 14", "Mar 14, 2027"
function relative(s: string, ref: string = today()): string {
  const days = diff(s, ref);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  const d = parse(s);
  if (days > 1 && days < 7) return DAYS[d.getDay()];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${s.slice(0, 4) === ref.slice(0, 4) ? '' : `, ${d.getFullYear()}`}`;
}

function long(s: string): string {
  const d = parse(s);
  return `${DAYS_LONG[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`;
}

function dueState(s: string | null, closed: boolean, ref: string = today()): DueState {
  if (!s || closed) return null;
  const days = diff(s, ref);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  return days <= 2 ? 'soon' : 'later';
}

function ago(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d ago` : short(toISO(new Date(ts)));
}

const time = (ts: number): string => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateTime = (ts: number): string => `${short(toISO(new Date(ts)))}, ${time(ts)}`;

function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  return h < 18 ? 'Good afternoon' : 'Good evening';
}

const dates = { MONTHS, MONTHS_LONG, DAYS, DAYS_LONG, toISO, parse, today, addDays, addMonths, diff, weekStart, weekEnd, monthStart, monthEnd, monthGrid, relative, short, long, dueState, ago, time, dateTime, greeting };

export default dates;
