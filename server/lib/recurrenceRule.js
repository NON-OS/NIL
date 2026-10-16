import domain from './domain.js';

const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
// Rules that say the same as a preset are stored as the preset, so older apps still read them.
const AS_PRESET = { 'FREQ=DAILY': 'daily', 'FREQ=WEEKLY': 'weekly', 'FREQ=WEEKLY;INTERVAL=2': 'biweekly', 'FREQ=MONTHLY': 'monthly' };

// How a task repeats beyond the presets: a small subset of iCalendar's RRULE (RFC 5545), such as
// FREQ=DAILY;INTERVAL=3 (every 3 days) or FREQ=MONTHLY;BYMONTHDAY=15 (every month on the 15th).
// BYMONTHDAY=-1 is the last day of the month.
const recurrenceRule = {
  parse(text) {
    if (typeof text !== 'string' || text.length > 64) return null;
    const fields = {};
    for (const part of text.split(';')) {
      const [key, value, extra] = part.split('=');
      if (extra !== undefined || !value || key in fields) return null;
      fields[key] = value;
    }
    const { FREQ, INTERVAL = '1', BYMONTHDAY, ...rest } = fields;
    if (Object.keys(rest).length || !FREQS.includes(FREQ) || !/^[1-9]\d{0,2}$/.test(INTERVAL) || Number(INTERVAL) > 365) return null;
    if (BYMONTHDAY !== undefined && (FREQ !== 'MONTHLY' || !/^(-1|[1-9]|[12]\d|3[01])$/.test(BYMONTHDAY))) return null;
    return { freq: FREQ, interval: Number(INTERVAL), monthDay: BYMONTHDAY === undefined ? null : Number(BYMONTHDAY) };
  },

  format({ freq, interval = 1, monthDay = null }) {
    const text = [`FREQ=${freq}`, interval > 1 && `INTERVAL=${interval}`, monthDay && `BYMONTHDAY=${monthDay}`].filter(Boolean).join(';');
    return AS_PRESET[text] ?? text;
  },

  // A preset or a rule in its one stored form, or null when the value is neither.
  normalize(value) {
    if (domain.recurrences.includes(value)) return value;
    const rule = recurrenceRule.parse(value);
    return rule ? recurrenceRule.format(rule) : null;
  },
};

export default recurrenceRule;
