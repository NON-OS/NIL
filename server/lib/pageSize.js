// A page size from the query string: a whole number from 1 to `max`, or `fallback` when it's
// missing or makes no sense. SQLite reads a negative LIMIT as no limit at all and refuses a
// fractional one, so the raw number never reaches a query.
export default function pageSize(value, fallback, max) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}
