import DAY from './day.mjs';

// The date some days from today, as the API takes due dates: 2026-11-02.
export default function isoDay(offsetDays) {
  return new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
}
