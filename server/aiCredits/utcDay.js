// The UTC calendar day, as YYYY-MM-DD. AI credits renew at UTC midnight for everyone at once, so
// the day in a request says nothing about where its sender lives.
export default function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}
