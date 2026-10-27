// Chunks that can carry where and when a picture was made, or who made it: Exif, the three kinds
// of text and the modification time.
const DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

// A PNG without its metadata chunks. Every other chunk is copied as it is.
export default function stripPng(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((b, i) => bytes[i] === b)) throw new Error('This isn’t a PNG.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const length = view.getUint32(i);
    const end = i + 12 + length;
    if (end > bytes.length) throw new Error('This PNG is damaged.');
    const type = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    if (!DROP.has(type)) parts.push(bytes.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
