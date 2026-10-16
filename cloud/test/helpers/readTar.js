import parseTarHeader from '../../lib/tar/parseTarHeader.js';
import tarBlocks from '../../lib/tar/tarBlocks.js';

// Every entry of a tar archive held in memory, for assertions.
export default function readTar(buffer) {
  const entries = [];
  let at = 0;
  while (at + 512 <= buffer.length) {
    const header = parseTarHeader(buffer.subarray(at, at + 512));
    if (!header) break;
    entries.push({ name: header.name.replace(/\/$/, ''), type: header.type, data: buffer.subarray(at + 512, at + 512 + header.size) });
    at += 512 + tarBlocks.padded(header.size);
  }
  return entries;
}
