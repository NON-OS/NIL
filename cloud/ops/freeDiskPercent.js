import fs from 'node:fs';

// How much of the disk holding `dir` is free, in percent, counting only what an unprivileged
// process may use.
export default function freeDiskPercent(dir) {
  const stats = fs.statfsSync(dir);
  return (stats.bavail / stats.blocks) * 100;
}
