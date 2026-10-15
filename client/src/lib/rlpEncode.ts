type Item = Uint8Array | Item[];

// Recursive-length-prefix encoding of byte strings and nested lists of them.
export default function rlpEncode(value: Item): Uint8Array {
  const head = (offset: number, length: number) => {
    if (length < 56) return Uint8Array.of(offset + length);
    const size: number[] = [];
    for (let n = length; n > 0; n = Math.floor(n / 256)) size.unshift(n % 256);
    return Uint8Array.of(offset + 55 + size.length, ...size);
  };
  const join = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  if (Array.isArray(value)) {
    const body = join(value.map(rlpEncode));
    return join([head(0xc0, body.length), body]);
  }
  if (value.length === 1 && value[0] < 0x80) return value;
  return join([head(0x80, value.length), value]);
}
