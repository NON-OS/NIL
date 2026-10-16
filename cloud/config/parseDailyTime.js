// "03:15" in UTC, or "off". Returns { hour, minute }, null for off, or undefined if unreadable.
export default function parseDailyTime(value) {
  if (value === 'off') return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Object.freeze({ hour: Number(match[1]), minute: Number(match[2]) }) : undefined;
}
