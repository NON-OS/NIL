// Today in UTC, from this device's own clock. Credits renew at UTC midnight for everyone.
export default function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}
