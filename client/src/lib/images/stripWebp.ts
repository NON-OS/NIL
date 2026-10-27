// A WebP without its EXIF and XMP chunks, and with the flags that announce them cleared. The
// picture's own chunks are copied as they are.
export default function stripWebp(bytes: Uint8Array) {
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('This isn’t a WebP.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const size = view.getUint32(i + 4, true);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > bytes.length) throw new Error('This WebP is damaged.');
    const name = tag(i);
    if (name !== 'EXIF' && name !== 'XMP ') {
      const chunk = bytes.slice(i, Math.min(end, bytes.length));
      // VP8X flags: bit 3 says there's Exif, bit 2 says there's XMP
      if (name === 'VP8X') chunk[8] &= ~0x0c;
      parts.push(chunk);
    }
    i = end;
  }
  const body = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(12 + body);
  out.set(bytes.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body, true);
  let at = 12;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
