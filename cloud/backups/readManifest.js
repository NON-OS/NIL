import { Readable } from 'node:stream';
import parseTarHeader from '../lib/tar/parseTarHeader.js';
import tarBlocks from '../lib/tar/tarBlocks.js';
import dataLayout from '../runtime/dataLayout.js';

const LIMIT = 64 * 1024;

// Reads the manifest at the start of a decrypted backup and hands back the rest of the archive
// as a stream, untouched. Backups made by hand without a manifest come back with manifest null.
export default async function readManifest(plain) {
  const iterator = plain[Symbol.asyncIterator]();
  let head = Buffer.alloc(0);
  const fill = async (length) => {
    while (head.length < length) {
      const { value, done } = await iterator.next();
      if (done) break;
      head = Buffer.concat([head, value]);
    }
  };

  await fill(512);
  const header = head.length >= 512 ? parseTarHeader(head.subarray(0, 512)) : null;
  let manifest = null;
  let skip = 0;
  if (header?.name === dataLayout.manifest && header.type === 'file' && header.size <= LIMIT) {
    await fill(512 + tarBlocks.padded(header.size));
    manifest = JSON.parse(head.subarray(512, 512 + header.size).toString('utf8'));
    skip = 512 + tarBlocks.padded(header.size);
  }
  const leftover = head.subarray(skip);
  const rest = Readable.from(
    (async function* () {
      if (leftover.length) yield leftover;
      while (true) {
        const { value, done } = await iterator.next();
        if (done) return;
        yield value;
      }
    })(),
  );
  return { manifest, rest };
}
