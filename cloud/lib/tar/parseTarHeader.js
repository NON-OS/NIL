import tarBlocks from './tarBlocks.js';

const TYPES = { 0: 'file', '': 'file', 7: 'file', 5: 'dir', 1: 'hardlink', 2: 'symlink', x: 'pax', g: 'pax-global', L: 'gnu-longname', K: 'gnu-longlink' };

const text = (block, start, length) => {
  const field = block.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? length : end).toString('utf8');
};

// Octal ASCII, or GNU base-256 for values that don't fit (files over 8 GiB).
function number(block, start, length) {
  const field = block.subarray(start, start + length);
  if (field[0] & 0x80) {
    let value = BigInt(field[0] & 0x7f);
    for (let i = 1; i < length; i++) value = (value << 8n) | BigInt(field[i]);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Tar entry too large.');
    return Number(value);
  }
  const digits = text(block, start, length).trim();
  return digits ? parseInt(digits, 8) : 0;
}

// Reads one 512-byte header. Returns null for an all-zero block (the end of the archive).
export default function parseTarHeader(block) {
  if (block.every((b) => b === 0)) return null;
  if (number(block, 148, 8) !== tarBlocks.checksum(block)) throw new Error('Tar header checksum mismatch.');
  const name = text(block, 0, 100);
  const prefix = text(block, 345, 155);
  const flag = String.fromCharCode(block[156]).replace('\0', '');
  return {
    name: prefix ? `${prefix}/${name}` : name,
    type: TYPES[flag] ?? 'other',
    size: number(block, 124, 12),
    mode: number(block, 100, 8),
    linkname: text(block, 157, 100),
  };
}
