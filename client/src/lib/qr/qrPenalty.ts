// How hard a finished symbol is to read, by the four rules of the QR standard: long runs of one
// colour, 2x2 blocks, patterns that look like a finder, and an uneven share of dark modules. The
// mask with the lowest score is the one used.
export default function qrPenalty(modules: boolean[][]): number {
  const size = modules.length;
  const at = (x: number, y: number, vertical: boolean) => (vertical ? modules[x][y] : modules[y][x]);
  let score = 0;

  for (const vertical of [false, true]) {
    for (let y = 0; y < size; y++) {
      let run = 1;
      for (let x = 1; x <= size; x++) {
        if (x < size && at(x, y, vertical) === at(x - 1, y, vertical)) {
          run++;
          continue;
        }
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
      // dark-light-dark-dark-dark-light-dark with four light modules on one side; outside the
      // symbol counts as light, since the quiet zone is
      const light = (x: number) => x < 0 || x >= size || !at(x, y, vertical);
      for (let x = 0; x + 6 < size; x++) {
        const core = !light(x) && light(x + 1) && !light(x + 2) && !light(x + 3) && !light(x + 4) && light(x + 5) && !light(x + 6);
        if (!core) continue;
        const before = light(x - 1) && light(x - 2) && light(x - 3) && light(x - 4);
        const after = light(x + 7) && light(x + 8) && light(x + 9) && light(x + 10);
        if (before) score += 40;
        if (after) score += 40;
      }
    }
  }

  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
  }

  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}
