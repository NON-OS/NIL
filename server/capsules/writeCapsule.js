import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import db from '../db/connection.js';
import config from '../config.js';
import uploadDir from '../lib/uploadDir.js';
import signingKey from '../proofs/signingKey.js';
import secretBox from '../agents/secretBox.js';
import deriveKey from './deriveKey.js';
import format from './format.js';

async function write(out, chunk) {
  if (chunk.length && !out.write(chunk)) await once(out, 'drain');
}

function frame(name, size) {
  const nameBytes = Buffer.from(name);
  const head = Buffer.alloc(2 + nameBytes.length + 8);
  head.writeUInt16BE(nameBytes.length, 0);
  nameBytes.copy(head, 2);
  head.writeBigUInt64BE(BigInt(size), 2 + nameBytes.length);
  return head;
}

// Streams an encrypted snapshot of the whole workspace into `out`.
export default async function writeCapsule(passphrase, out) {
  const tmpDir = fs.mkdtempSync(path.join(config.dataDir, 'capsule-'));
  const snapshot = path.join(tmpDir, 'nonos.db');
  try {
    // VACUUM INTO gives a consistent copy while the server keeps running
    db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
    const entries = [{ name: 'nonos.db', file: snapshot }];
    signingKey.publicKey();
    entries.push({ name: 'keys/receipts-ed25519.pem', file: signingKey.file });
    // agents' webhook secrets and model API keys are sealed under this one; skipped if never made
    entries.push({ name: 'keys/agents-secrets.key', file: secretBox.file });
    for (const id of fs.readdirSync(uploadDir)) entries.push({ name: `uploads/${id}`, file: path.join(uploadDir, id) });

    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const header = Buffer.concat([format.magic, Buffer.from([format.version]), salt, iv]);
    const cipher = crypto.createCipheriv('aes-256-gcm', await deriveKey(passphrase, salt), iv);
    cipher.setAAD(header);

    await write(out, header);
    for (const { name, file } of entries) {
      if (!format.allowed(name) || !fs.existsSync(file)) continue;
      await write(out, cipher.update(frame(name, fs.statSync(file).size)));
      for await (const chunk of fs.createReadStream(file)) await write(out, cipher.update(chunk));
    }
    await write(out, cipher.update(Buffer.alloc(2)));
    await write(out, cipher.final());
    await write(out, cipher.getAuthTag());
    out.end();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
