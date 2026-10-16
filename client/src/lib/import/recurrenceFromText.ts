import type Recurrence from '../../types/Recurrence';

// Repeat phrases like Todoist's "every monday" or "every other week". Anything fancier
// ("every 3rd friday") stays a one-off; the original wording is kept in the task's notes.
const RULES: [RegExp, Recurrence][] = [
  [/^(every (day|morning|evening|night)|daily)$/i, 'daily'],
  [/^every (weekday|workday|work day)$/i, 'weekdays'],
  [/^(every (other|2) weeks?|biweekly|fortnightly)$/i, 'biweekly'],
  [/^(every (week|mon|monday|tue|tuesday|wed|wednesday|thu|thursday|fri|friday|sat|saturday|sun|sunday)|weekly)$/i, 'weekly'],
  [/^(every month|monthly)$/i, 'monthly'],
];

export default function recurrenceFromText(text: string | null | undefined): Recurrence | null {
  const value = (text ?? '').trim().replace(/\s+/g, ' ');
  return RULES.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}
