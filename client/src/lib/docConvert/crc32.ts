let table: Uint32Array | null = null;

// The CRC-32 a zip file records for each entry (the IEEE polynomial, reflected). Pass the CRC of
// the bytes before to carry on from them, so a file can be checked a chunk at a time.
export default function crc32(bytes: Uint8Array, before = 0) {
  table ??= Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = (before ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
