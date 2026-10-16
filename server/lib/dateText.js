// A day as 2026-10-19 (UTC), for server messages read in any time zone.
export default function dateText(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
