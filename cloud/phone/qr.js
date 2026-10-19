// A small QR code encoder (ISO/IEC 18004), so a page link can be shown as a code without any
// library or web service. Byte mode, error correction level M (about 15% of the code can be
// damaged and still scan), any version from 1 to 40, mask chosen by the standard's penalty rules.
// Returns the modules as rows of booleans, true for dark, without the quiet zone.
// The web app's encoder (client/src/lib/qr.ts) without its types: the control plane builds from
// its own folder, so it keeps a copy, and test/phoneQr.test.js keeps the two drawing alike.

// Per version, at level M: error correction codewords in each block, and how many blocks.
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
// level M is written as 00 in the format bits
const FORMAT_LEVEL = 0;

// Modules left for data and error correction once the fixed patterns are placed.
function rawModules(version) {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

const dataCodewords = (version) => Math.floor(rawModules(version) / 8) - ECC_PER_BLOCK[version] * BLOCKS[version];

// Multiplication in GF(2^8) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMultiply(coef, factor)));
  }
  return result;
}

// Data bytes framed as one byte-mode segment, padded, split into blocks with their error
// correction, and interleaved in the order the code is read.
function codewords(bytes, version) {
  const bits = [];
  const put = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  const capacity = dataCodewords(version) * 8;
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  const blocks = BLOCKS[version];
  const eccLength = ECC_PER_BLOCK[version];
  const raw = Math.floor(rawModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLength = Math.floor(raw / blocks);
  const divisor = rsDivisor(eccLength);
  const all = [];
  for (let i = 0, at = 0; i < blocks; i++) {
    const chunk = data.slice(at, at + shortLength - eccLength + (i < shortBlocks ? 0 : 1));
    at += chunk.length;
    const ecc = rsRemainder(chunk, divisor);
    // short blocks get a placeholder so every block lines up for interleaving
    if (i < shortBlocks) chunk.push(-1);
    all.push([...chunk, ...ecc]);
  }
  const out = [];
  for (let i = 0; i < all[0].length; i++) for (const block of all) if (block[i] !== -1) out.push(block[i]);
  return out;
}

function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

function bchFormat(mask) {
  const data = (FORMAT_LEVEL << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function bchVersion(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// The standard's four penalty rules: long runs, 2x2 blocks, finder-like patterns, imbalance.
function penalty(m) {
  const size = m.length;
  let score = 0;
  const line = (get) => {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    for (let i = 0; i + 11 <= size; i++) {
      const s = Array.from({ length: 11 }, (_, k) => (get(i + k) ? '1' : '0')).join('');
      if (s === '10111010000' || s === '00001011101') score += 40;
    }
  };
  for (let y = 0; y < size; y++) line((x) => m[y][x]);
  for (let x = 0; x < size; x++) line((y) => m[y][x]);
  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (x + 1 < size && y + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    }
  }
  score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return score;
}

export default function qr(text) {
  const bytes = new TextEncoder().encode(text);
  let version = 1;
  while (version <= 40 && 4 + (version < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(version) * 8) version++;
  if (version > 40) throw new Error('That’s too long for a QR code.');

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => {
    modules[y][x] = dark;
    fixed[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const align = alignmentPositions(version);
  for (const ay of align) {
    for (const ax of align) {
      // alignment patterns never overlap the finder corners
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === align[align.length - 1]) || (ay === 6 && ax === align[align.length - 1])) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  const drawFormat = (mask) => {
    const bits = bchFormat(mask);
    const bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    const bits = bchVersion(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  // codewords run in two-module columns from the bottom right, zigzagging up and down
  const data = codewords(bytes, version);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fixed[y][x] && i < data.length * 8) {
          modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }

  const masked = (mask) => {
    const out = modules.map((row, y) => row.map((dark, x) => (fixed[y][x] ? dark : dark !== MASKS[mask](x, y))));
    return out;
  };
  let best = [];
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    drawFormat(mask);
    const candidate = masked(mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
