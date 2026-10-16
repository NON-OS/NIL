import qrTables from './qrTables';
import qrCapacity from './qrCapacity';
import reedSolomon from './reedSolomon';

const dataCapacity = (version: number) => qrCapacity(version) - qrTables.ecPerBlock[version] * qrTables.blocks[version];

// The final codeword sequence for `bytes` in byte mode at level M: the smallest version that
// fits, the data with its mode and length header, padding, error correction per block, and the
// blocks interleaved the way a reader expects.
export default function qrCodewords(bytes: Uint8Array): { version: number; codewords: number[] } {
  let version = 1;
  const bitsNeeded = (v: number) => 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
  while (version <= 40 && bitsNeeded(version) > dataCapacity(version) * 8) version++;
  if (version > 40) throw new Error('That is too long for a QR code.');

  const bits: number[] = [];
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  const capacityBits = dataCapacity(version) * 8;
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, capacityBits - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) put(pad, 8);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));

  // short blocks first, then blocks one data codeword longer
  const blockCount = qrTables.blocks[version];
  const ec = qrTables.ecPerBlock[version];
  const total = qrCapacity(version);
  const shortBlocks = blockCount - (total % blockCount);
  const shortData = Math.floor(total / blockCount) - ec;
  const blocks: { data: number[]; ec: number[] }[] = [];
  for (let b = 0, at = 0; b < blockCount; b++) {
    const length = shortData + (b < shortBlocks ? 0 : 1);
    const chunk = data.slice(at, at + length);
    at += length;
    blocks.push({ data: chunk, ec: reedSolomon(chunk, ec) });
  }

  const codewords: number[] = [];
  for (let i = 0; i <= shortData; i++) for (const block of blocks) if (i < block.data.length) codewords.push(block.data[i]);
  for (let i = 0; i < ec; i++) for (const block of blocks) codewords.push(block.ec[i]);
  return { version, codewords };
}
