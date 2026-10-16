import qrPenalty from './qrPenalty';

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// a 15-bit BCH(15,5) word for the error correction level (M = 0b00) and mask
function formatBits(mask: number) {
  const data = mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

// an 18-bit BCH(18,6) word for versions 7 and up
function versionBits(version: number) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function alignmentCentres(version: number, size: number) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const centres = [6];
  for (let pos = size - 7; centres.length < count; pos -= step) centres.splice(1, 0, pos);
  return centres;
}

// Lays the codewords out as a QR symbol: finder, timing and alignment patterns, the data in the
// standard zigzag, a mask, and the format and version information. Without a `forceMask`, every
// mask is tried and the easiest to read is kept. Returns rows of modules, true for dark.
export default function qrMatrix(version: number, codewords: number[], forceMask?: number): boolean[][] {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    fixed(6, i, i % 2 === 0);
    fixed(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) fixed(x, y, ring !== 2 && ring !== 4);
      }
    }
  }
  const centres = alignmentCentres(version, size);
  for (const cy of centres) {
    for (const cx of centres) {
      // the three corners already hold finder patterns
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fixed(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  // the format information sits around the finders, twice; reserved now, written per mask
  const placeFormat = (target: boolean[][], mask: number) => {
    const bits = formatBits(mask);
    const put = (x: number, y: number, i: number) => {
      target[y][x] = ((bits >>> i) & 1) === 1;
      reserved[y][x] = true;
    };
    for (let i = 0; i <= 5; i++) put(8, i, i);
    put(8, 7, 6);
    put(8, 8, 7);
    put(7, 8, 8);
    for (let i = 9; i < 15; i++) put(14 - i, 8, i);
    for (let i = 0; i < 8; i++) put(size - 1 - i, 8, i);
    for (let i = 8; i < 15; i++) put(8, size - 15 + i, i);
    target[size - 8][8] = true;
    reserved[size - 8][8] = true;
  };
  placeFormat(modules, 0);
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      fixed(a, b, dark);
      fixed(b, a, dark);
    }
  }

  // data, two columns at a time from the right, up then down, skipping the vertical timing line
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (reserved[y][x] || i >= codewords.length * 8) continue;
        modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }

  const withMask = (mask: number) => {
    const out = modules.map((row, y) => row.map((dark, x) => (reserved[y][x] ? dark : dark !== MASKS[mask](x, y))));
    placeFormat(out, mask);
    return out;
  };

  if (forceMask !== undefined) return withMask(forceMask);
  let best = withMask(0);
  let bestScore = qrPenalty(best);
  for (let mask = 1; mask < 8; mask++) {
    const candidate = withMask(mask);
    const score = qrPenalty(candidate);
    if (score < bestScore) [best, bestScore] = [candidate, score];
  }
  return best;
}
