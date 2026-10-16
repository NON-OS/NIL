import dates from '../dates';

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T/;

// A due date as YYYY-MM-DD, or null when the text isn't a date we can be sure of. A plain day
// stays that day; a moment in time (Trello's due dates) becomes the day it falls on here.
// Other spellings count only with a four-digit year, since "Mar 15" alone would be read as
// some year in the past.
export default function dateFromText(text: string | null | undefined): string | null {
  const value = (text ?? '').trim();
  if (!value) return null;
  const day = ISO_DAY.exec(value);
  if (day) return Number(day[2]) >= 1 && Number(day[2]) <= 12 && Number(day[3]) >= 1 && Number(day[3]) <= 31 ? value : null;
  if (!ISO_TIME.test(value) && !/\b\d{4}\b/.test(value)) return null;
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? null : dates.toISO(when);
}
