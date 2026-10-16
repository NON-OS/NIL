import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { finished as streamFinished } from 'node:stream/promises';
import HttpError from '../lib/HttpError.js';
import deriveKey from './deriveKey.js';
import format from './format.js';

const damaged = () => HttpError.badRequest('That passphrase is wrong, or the capsule file is damaged.');

// Decrypts a capsule file into `outDir`. GCM only proves authenticity at the very end, so the
// caller must treat `outDir` as untrusted until this resolves, and delete it if it throws.
export default async function readCapsule(file, passphrase, outDir) {
  const { size } = fs.statSync(file);
  if (size < format.headerLength + format.tagLength + 2) throw damaged();
  const fd = fs.openSync(file, 'r');
  const header = Buffer.alloc(format.headerLength);
  const tag = Buffer.alloc(format.tagLength);
  fs.readSync(fd, header, 0, header.length, 0);
  fs.readSync(fd, tag, 0, tag.length, size - format.tagLength);
  fs.closeSync(fd);
  if (!header.subarray(0, 8).equals(format.magic)) throw HttpError.badRequest('That isn’t a Nil capsule.');
  if (header[8] !== format.version) throw HttpError.badRequest('This capsule was made by a newer version of Nil. Update this server first.');

  const salt = header.subarray(9, 25);
  const iv = header.subarray(25, 37);
  const decipher = crypto.createDecipheriv('aes-256-gcm', await deriveKey(passphrase, salt), iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  fs.createReadStream(file, { start: format.headerLength, end: size - format.tagLength - 1 }).pipe(decipher);

  let pending = Buffer.alloc(0);
  let current = null; // { out, remaining }
  let finished = false;
  const flushed = [];
  try {
    for await (const chunk of decipher) {
      pending = Buffer.concat([pending, chunk]);
      while (!finished) {
        if (current) {
          const take = Math.min(current.remaining, pending.length);
          if (!take && current.remaining) break;
          current.out.write(pending.subarray(0, take));
          pending = pending.subarray(take);
          current.remaining -= take;
          if (current.remaining) break;
          current.out.end();
          current = null;
          continue;
        }
        if (pending.length < 2) break;
        const nameLength = pending.readUInt16BE(0);
        if (nameLength === 0) {
          finished = true;
          break;
        }
        if (pending.length < 2 + nameLength + 8) break;
        const name = pending.subarray(2, 2 + nameLength).toString();
        const entrySize = Number(pending.readBigUInt64BE(2 + nameLength));
        if (!format.allowed(name)) throw damaged();
        pending = pending.subarray(2 + nameLength + 8);
        const target = path.join(outDir, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        current = { out: fs.createWriteStream(target, { mode: 0o600 }), remaining: entrySize };
        const done = streamFinished(current.out);
        // handled here so a failed restore can't surface as an unhandled rejection
        done.catch(() => {});
        flushed.push(done);
      }
    }
  } catch (err) {
    current?.out.destroy();
    throw err instanceof HttpError ? err : damaged();
  }
  // every extracted file must be fully on disk before anyone opens it
  await Promise.all(flushed);
  if (!finished || current) throw damaged();
}
