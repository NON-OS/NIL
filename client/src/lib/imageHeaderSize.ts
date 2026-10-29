// An image's size in pixels as its header gives it, for PNG, WebP, JPEG and GIF, read before
// anything decodes it, so a small file claiming a huge picture is refused first. Null for
// anything else or a header that doesn't parse.
// a JPEG's size, from the first start-of-frame segment
function jpegSize(bytes: Uint8Array, view: DataView) {
  for (let i = 2; i + 9 < bytes.length; ) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
    i += 2 + view.getUint16(i + 2);
  }
  return null;
}

export default function imageHeaderSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && ascii(12, 4) === 'IHDR') return { width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length >= 10 && ascii(0, 3) === 'GIF') return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes, view);
  if (bytes.length < 30 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return null;
  const chunk = ascii(12, 4);
  if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  if (chunk === 'VP8L') {
    const b = view.getUint32(21, true);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
  return null;
}
