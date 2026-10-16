// For operator output only: 1.4 GB, 812 MB. Binary units, labelled the way people read them.
export default function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || bytes < 0) return '?';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
