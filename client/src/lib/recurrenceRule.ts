import meta from './meta';
import type Recurrence from '../types/Recurrence';

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

interface Rule {
  freq: Freq;
  interval: number;
  // day of the month for monthly rules; -1 is the last day
  monthDay: number | null;
}

const FREQS: Freq[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const UNIT: Record<Freq, string> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' };
// rules that say the same as a preset travel as the preset, as the server stores them
const AS_PRESET: Record<string, Recurrence> = { 'FREQ=DAILY': 'daily', 'FREQ=WEEKLY': 'weekly', 'FREQ=WEEKLY;INTERVAL=2': 'biweekly', 'FREQ=MONTHLY': 'monthly' };

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function parse(value: string): Rule | null {
  const fields: Record<string, string> = {};
  for (const part of value.split(';')) {
    const [key, v] = part.split('=');
    if (!v) return null;
    fields[key] = v;
  }
  const freq = fields.FREQ as Freq;
  if (!FREQS.includes(freq)) return null;
  return { freq, interval: Number(fields.INTERVAL ?? 1), monthDay: fields.BYMONTHDAY ? Number(fields.BYMONTHDAY) : null };
}

function format({ freq, interval, monthDay }: Rule): Recurrence {
  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (monthDay) parts.push(`BYMONTHDAY=${monthDay}`);
  const text = parts.join(';');
  return AS_PRESET[text] ?? (text as Recurrence);
}

// "Every 3 days", "Every month on the 15th", "Every 2 weeks"
function describe(value: Recurrence): string {
  if (value in meta.recurrence) return meta.recurrence[value];
  const rule = parse(value);
  if (!rule) return 'Repeats';
  const every = rule.interval === 1 ? `Every ${UNIT[rule.freq]}` : `Every ${rule.interval} ${UNIT[rule.freq]}s`;
  if (!rule.monthDay) return every;
  return `${every} on the ${rule.monthDay === -1 ? 'last day' : ordinal(rule.monthDay)}`;
}

const recurrenceRule = { parse, format, describe, ordinal };

export default recurrenceRule;
