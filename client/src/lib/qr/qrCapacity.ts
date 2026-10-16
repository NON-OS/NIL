// Codewords a QR symbol of this version holds in all: its modules minus the finder, timing and
// alignment patterns, the format and version areas, divided into bytes.
export default function qrCapacity(version: number) {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    modules -= (25 * align - 10) * align - 55;
    if (version >= 7) modules -= 36;
  }
  return Math.floor(modules / 8);
}
