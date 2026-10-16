// The i-th 32-byte word of ABI-encoded return data, as an unsigned or two's-complement signed
// BigInt. Null when the data is too short, so a truncated answer never reads as zero.
export default function abiWord(hex, i, { signed = false } = {}) {
  const body = typeof hex === 'string' ? hex.replace(/^0x/, '') : '';
  const chunk = body.slice(i * 64, i * 64 + 64);
  if (chunk.length !== 64) return null;
  const value = BigInt(`0x${chunk}`);
  return signed && value >= 1n << 255n ? value - (1n << 256n) : value;
}
