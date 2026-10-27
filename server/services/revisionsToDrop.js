const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// How far apart kept versions have to be at a given age: close together for the last hour, then
// one every quarter of an hour for a day, then one a day. Live editing saves a version every few
// seconds, so without this the history would only reach back a few minutes.
const spacing = (age) => (age < HOUR ? MINUTE : age < DAY ? 15 * MINUTE : DAY);

// Which saved versions to let go, newest first in and out. The newest is always kept, and never
// more than `keep` in all.
export default function revisionsToDrop(rows, now, keep) {
  const drop = [];
  let last = null;
  let kept = 0;
  for (const r of rows) {
    const far = last === null || last - r.created_at >= spacing(now - r.created_at);
    if (far && kept < keep) {
      kept += 1;
      last = r.created_at;
    } else drop.push(r.version);
  }
  return drop;
}
