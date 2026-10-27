// The application extensions a GIF needs to play: how many times to loop.
const LOOPS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);

// A GIF without comments or application extensions (XMP rides in one), keeping the loop count.
// Frames are copied as they are, so an animation stays animated.
export default function stripGif(bytes: Uint8Array) {
  const head = String.fromCharCode(...bytes.subarray(0, 6));
  if (head !== 'GIF87a' && head !== 'GIF89a') throw new Error('This isn’t a GIF.');
  const table = (flags: number) => (flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0);
  const blocks = (at: number) => {
    while (at < bytes.length && bytes[at] !== 0) at += bytes[at] + 1;
    if (at >= bytes.length) throw new Error('This GIF is damaged.');
    return at + 1;
  };
  const parts: Uint8Array[] = [];
  let i = 13 + table(bytes[10]);
  parts.push(bytes.subarray(0, i));
  while (i < bytes.length) {
    const start = i;
    if (bytes[i] === 0x3b) {
      parts.push(bytes.subarray(i, i + 1));
      break;
    }
    if (bytes[i] === 0x2c) {
      i = blocks(i + 10 + table(bytes[i + 9]) + 1);
      parts.push(bytes.subarray(start, i));
    } else if (bytes[i] === 0x21) {
      const label = bytes[i + 1];
      const app = label === 0xff ? String.fromCharCode(...bytes.subarray(i + 3, i + 14)) : '';
      i = blocks(i + 2);
      if (label !== 0xfe && (label !== 0xff || LOOPS.has(app))) parts.push(bytes.subarray(start, i));
    } else throw new Error('This GIF is damaged.');
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
