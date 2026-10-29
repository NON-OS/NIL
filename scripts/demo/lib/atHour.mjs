import DAY from './day.mjs';

// A time some days from today, on the hour, in local time.
export default function atHour(days, hour) {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}
