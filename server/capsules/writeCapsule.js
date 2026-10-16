import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import db from '../db/connection.js';
import config from '../config.js';
import uploadDir from '../lib/uploadDir.js';
import signingKey from '../proofs/signingKey.js';
import deriveKey from './deriveKey.js';
import format from './format.js';

function frame(name, size) {
  const nameBytes = Buffer.from(name);
  const head = Buffer.alloc(2 + nameBytes.length + 8);
  head.writeUInt16BE(nameBytes.length, 0);
  nameBytes.copy(head, 2);
  head.writeBigUInt64BE(BigInt(size), 2 + nameBytes.length);
  return head;
}

// The capsule as a stream of encrypted chunks. Files are read as they're needed, so memory use
// stays flat however large the workspace is, and stopping early stops the reading too.
async function* encrypted(entries, key, header, iv) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);
  yield header;
  for (const { name, file } of entries) {
    if (!format.allowed(name) || !fs.existsSync(file)) continue;
    yield cipher.update(frame(name, fs.statSync(file).size));
    for await (const chunk of fs.createReadStream(file)) yield cipher.update(chunk);
  }
  yield cipher.update(Buffer.alloc(2));
  const tail = cipher.final();
  if (tail.length) yield tail;
  yield cipher.getAuthTag();
}

// Streams an encrypted snapshot of the whole workspace into `out`. Aborting `signal` (the
// browser went away) stops the stream, and the plaintext snapshot of the database is deleted
// whatever happens: it holds everything the capsule exists to protect.
export default async function writeCapsule(passphrase, out, { signal } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(config.dataDir, 'capsule-'));
  try {
    const snapshot = path.join(tmpDir, 'nonos.db');
    // VACUUM INTO gives a consistent copy while the server keeps running
    db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
    signingKey.publicKey();
    const entries = [
      { name: 'nonos.db', file: snapshot },
      { name: 'keys/receipts-ed25519.pem', file: signingKey.file },
      ...fs.readdirSync(uploadDir).map((id) => ({ name: `uploads/${id}`, file: path.join(uploadDir, id) })),
    ];

    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const header = Buffer.concat([format.magic, Buffer.from([format.version]), salt, iv]);
    const key = await deriveKey(passphrase, salt);
    signal?.throwIfAborted();
    await pipeline(encrypted(entries, key, header, iv), out, { signal });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
