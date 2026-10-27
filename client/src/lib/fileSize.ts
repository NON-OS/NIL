const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

// A file size the way file managers write it: 512 B, 4.2 MB, 18 MB, 1.5 GB. One decimal below 10.
export default function fileSize(bytes: number) {
  let n = Math.max(0, bytes);
  let unit = 0;
  while (n >= 1024 && unit < UNITS.length - 1) {
    n /= 1024;
    unit++;
  }
  return `${unit && n < 10 ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n)} ${UNITS[unit]}`;
}
