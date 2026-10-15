// 5_400_000 ms → "1h 30m". Rounded to the minute, since that's what timesheets care about.
export default function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}
