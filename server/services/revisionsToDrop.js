const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// How wide each slot of the history is at a given age: a minute for the last hour, a quarter of
// an hour for a day, then a day. Live editing saves a version every few seconds, so without this
// the history would only reach back a few minutes.
const spacing = (age) => (age < HOUR ? MINUTE : age < DAY ? 15 * MINUTE : DAY);

// Which saved versions to let go, newest first in and out: the newest version in each slot
// stays, up to `keep` in all, and the rest go. Slots are fixed stretches of the clock, so a
// steady run of saves keeps one a minute instead of each save pushing out the one before it.
export default function revisionsToDrop(rows, now, keep) {
  const seen = new Set();
  const drop = [];
  for (const r of rows) {
    const width = spacing(now - r.created_at);
    const slot = `${width}:${Math.floor(r.created_at / width)}`;
    if (!seen.has(slot) && seen.size < keep) seen.add(slot);
    else drop.push(r.version);
  }
  return drop;
}
