// The next time it is hour:minute in UTC, after `now`, as a timestamp.
export default function nextDailyRun(now, { hour, minute }) {
  const next = new Date(now);
  next.setUTCHours(hour, minute, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}
