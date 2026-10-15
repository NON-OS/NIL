import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import sql from '../db/sql.js';
import config from '../config.js';
import route from '../lib/route.js';
import calendar from '../lib/calendar.js';
import HttpError from '../lib/HttpError.js';
import requireAuth from '../auth/requireAuth.js';
import requireAdmin from '../auth/requireAdmin.js';
import rateLimit from '../auth/rateLimit.js';
import writeCapsule from '../capsules/writeCapsule.js';
import readCapsule from '../capsules/readCapsule.js';
import restoreCapsule from '../capsules/restoreCapsule.js';

const router = express.Router();
const MAX_CAPSULE = Number(process.env.MAX_CAPSULE_MB || 4096) * 1024 * 1024;
let restoring = false;

function passphraseFrom(value) {
  if (typeof value !== 'string' || value.length < 12) throw HttpError.badRequest('Use a passphrase of at least 12 characters.');
  if (value.length > 500) throw HttpError.badRequest('That passphrase is too long.');
  return value;
}

router.post('/export/capsule', requireAuth, requireAdmin, async (req, res) => {
  let passphrase;
  try {
    passphrase = passphraseFrom(req.body?.passphrase);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="nonos-${calendar.today()}.capsule"`);
  try {
    await writeCapsule(passphrase, res);
  } catch (err) {
    console.error('[capsule export]', err.message);
    res.destroy(err);
  }
});

// Fresh servers only: a capsule can never overwrite a workspace that's already in use.
router.post(
  '/auth/restore',
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  route(async (req) => {
    if (sql.get('SELECT 1 FROM users LIMIT 1')) throw new HttpError(409, 'This server already has a workspace. Restore only works on a fresh install.');
    if (restoring) throw new HttpError(409, 'A restore is already running.');
    let passphrase;
    try {
      passphrase = passphraseFrom(Buffer.from(String(req.headers['x-capsule-passphrase'] || ''), 'base64').toString('utf8'));
    } catch (err) {
      throw HttpError.badRequest(err.message);
    }
    restoring = true;
    const work = fs.mkdtempSync(path.join(config.dataDir, 'restore-'));
    try {
      const file = path.join(work, 'upload.capsule');
      let received = 0;
      req.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_CAPSULE) req.destroy(new Error('too large'));
      });
      try {
        await pipeline(req, fs.createWriteStream(file, { mode: 0o600 }));
      } catch {
        throw new HttpError(received > MAX_CAPSULE ? 413 : 400, received > MAX_CAPSULE ? 'That capsule is larger than this server accepts (MAX_CAPSULE_MB).' : 'The upload was interrupted. Try again.');
      }
      const out = path.join(work, 'out');
      fs.mkdirSync(out);
      await readCapsule(file, passphrase, out);
      if (sql.get('SELECT 1 FROM users LIMIT 1')) throw new HttpError(409, 'Someone set this server up while the restore was running.');
      restoreCapsule(out);
      return { ok: true };
    } finally {
      restoring = false;
      fs.rmSync(work, { recursive: true, force: true });
    }
  }),
);

export default router;
