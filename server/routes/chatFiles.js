import express from 'express';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import config from '../config.js';
import receiveUpload from '../lib/receiveUpload.js';
import rateLimit from '../auth/rateLimit.js';
import chatId from '../chat/chatId.js';
import channelAccess from '../chat/channelAccess.js';
import chatQuota from '../chat/chatQuota.js';
import chatFilePath from '../chat/chatFilePath.js';

const router = express.Router();
const TOO_LARGE = 'That file is too large.';
// a file the browser encrypted: its bytes plus AES-GCM's 12-byte IV and 16-byte tag
const limit = () => config.maxUploadBytes + 28;

const uploadsPerHour = rateLimit({ windowMs: 3_600_000, max: config.uploads.perHour, key: (req) => req.user.id, message: 'You’ve sent a lot of files in the last hour. Wait a while and try again.' });

// A file for a message, encrypted in the browser under a key that travels inside the message.
// Its id is the browser's, since the ciphertext names it; its name and type are only in the
// message. It waits here until a message posts it, and goes if none does.
router.post(
  '/chat/channels/:id/files',
  uploadsPerHour,
  route(async (req) => {
    const channel = channelAccess(req.params.id, req.user);
    const id = chatId(req.headers['x-chat-file'], 'File id');
    if (req.headers['x-filename'] !== undefined || !/^application\/octet-stream\b/.test(req.headers['content-type'] ?? '')) throw HttpError.badRequest('Send a chat file encrypted only, without its name or type.');
    const declared = Number(req.headers['content-length']);
    if (declared > limit()) throw new HttpError(413, TOO_LARGE);
    if (sql.get('SELECT 1 FROM chat_files WHERE id = ?', id) || fs.existsSync(chatFilePath(id))) throw HttpError.badRequest('Pick a fresh file id.');
    const release = chatQuota(req.user, declared || limit());
    // the row comes first, so two uploads under one id can't both write its file
    try {
      sql.run('INSERT INTO chat_files (id, channel_id, uploader_id, size, created_at) VALUES (?, ?, ?, 0, ?)', id, channel.id, req.user.id, Date.now());
    } catch {
      release();
      throw HttpError.badRequest('Pick a fresh file id.');
    }
    try {
      const size = await receiveUpload(req, chatFilePath(id), { limit: limit(), tooLarge: TOO_LARGE });
      sql.run('UPDATE chat_files SET size = ? WHERE id = ?', size, id);
      return { file: { id, size } };
    } catch (err) {
      sql.run('DELETE FROM chat_files WHERE id = ?', id);
      fs.rmSync(chatFilePath(id), { force: true });
      throw err;
    } finally {
      release();
    }
  }),
);

router.get(
  '/chat/files/:id',
  route(async (req, res) => {
    const row = sql.get('SELECT * FROM chat_files WHERE id = ?', String(req.params.id));
    if (!row) throw HttpError.notFound('That file');
    channelAccess(row.channel_id, req.user);
    if (!fs.existsSync(chatFilePath(row.id))) throw HttpError.notFound('That file');
    // only ciphertext, for the browser to open itself; never something a browser would render
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="file"');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    // a file that can't be read ends the answer, not the server; a reader who went away is no error
    try {
      await pipeline(fs.createReadStream(chatFilePath(row.id)), res);
    } catch (err) {
      if (err?.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw err;
    }
  }),
);

export default router;
