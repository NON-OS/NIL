import recurrenceRule from './recurrenceRule.js';

// Plain calendar math on 'YYYY-MM-DD' strings. Noon UTC keeps DST from shifting days.
const toDate = (s) => new Date(`${s}T12:00:00Z`);
const toString = (d) => d.toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');
const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// `day` in the given month, held to the month's length; -1 is the last day.
const dayOf = (year, month, day) => `${year}-${pad(month)}-${pad(day === -1 ? daysIn(year, month) : Math.min(day, daysIn(year, month)))}`;

const calendar = {
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  addDays(s, n) {
    const d = toDate(s);
    d.setUTCDate(d.getUTCDate() + n);
    return toString(d);
  },

  // Jan 31 plus one month is Feb 28, not Mar 3.
  addMonths(s, n, day = Number(s.slice(8))) {
    const total = Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)) - 1 + n;
    return dayOf(Math.floor(total / 12), (total % 12) + 1, day);
  },

  next(s, recurrence) {
    switch (recurrence) {
      case 'daily':
        return calendar.addDays(s, 1);
      case 'weekdays': {
        let d = calendar.addDays(s, 1);
        while ([0, 6].includes(toDate(d).getUTCDay())) d = calendar.addDays(d, 1);
        return d;
      }
      case 'weekly':
        return calendar.addDays(s, 7);
      case 'biweekly':
        return calendar.addDays(s, 14);
      case 'monthly':
        return calendar.addMonths(s, 1);
      default:
        return calendar.nextByRule(s, recurrenceRule.parse(recurrence));
    }
  },

  nextByRule(s, rule) {
    if (!rule) return null;
    if (rule.freq === 'DAILY') return calendar.addDays(s, rule.interval);
    if (rule.freq === 'WEEKLY') return calendar.addDays(s, 7 * rule.interval);
    if (rule.freq === 'YEARLY') return calendar.addMonths(s, 12 * rule.interval);
    if (!rule.monthDay) return calendar.addMonths(s, rule.interval);
    // a date before this month's day steps to it first, then the rule keeps its rhythm
    const sameMonth = dayOf(Number(s.slice(0, 4)), Number(s.slice(5, 7)), rule.monthDay);
    return sameMonth > s ? sameMonth : calendar.addMonths(s, rule.interval, rule.monthDay);
  },
};

export default calendar;
