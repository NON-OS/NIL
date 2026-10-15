import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import newId from '../lib/newId.js';
import config from '../config.js';
import uploadDir from '../lib/uploadDir.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import loadTask from '../services/loadTask.js';
import publishTask from '../services/publishTask.js';
import logActivity from '../services/logActivity.js';
import toAttachment from '../mappers/toAttachment.js';

const router = express.Router();

// Only these render in the browser. Everything else downloads as an opaque file,
// so an uploaded .html or .svg can never run script on our origin.
const INLINE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

function syncCount(taskId) {
  const { n } = sql.get('SELECT COUNT(*) AS n FROM attachments WHERE task_id = ?', taskId);
  sql.run('UPDATE tasks SET attachment_count = ? WHERE id = ?', n, taskId);
  publishTask(taskId);
}

function cleanName(header) {
  let name = 'file';
  try {
    name = decodeURIComponent(String(header || 'file'));
  } catch {}
  return path.basename(name).replace(/[\u0000-\u001f\u007f"\\/]/g, '').slice(0, 200) || 'file';
}

router.post(
  '/tasks/:id/attachments',
  express.raw({ type: () => true, limit: config.maxUploadBytes }),
  route((req) => {
    const task = loadTask(req.params.id);
    if (!task || task.deletedAt) throw HttpError.notFound('That task');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw HttpError.badRequest('That file is empty.');

    const id = newId();
    const filename = cleanName(req.headers['x-filename']);
    const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase().slice(0, 100);
    fs.writeFileSync(path.join(uploadDir, id), req.body, { mode: 0o600 });
    sql.run(
      'INSERT INTO attachments (id, task_id, uploader_id, filename, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, task.id, req.user.id, filename, mime, req.body.length, Date.now(),
    );
    const attachment = toAttachment(sql.get('SELECT * FROM attachments WHERE id = ?', id));
    hub.broadcast({ type: 'attachment', attachment });
    logActivity(task.id, req.user.id, 'attachment', { filename });
    syncCount(task.id);
    return { attachment };
  }),
);

router.get(
  '/attachments/:id',
  route((req, res) => {
    const row = sql.get('SELECT * FROM attachments WHERE id = ?', req.params.id);
    const file = row && path.join(uploadDir, row.id);
    if (!row || !fs.existsSync(file)) throw HttpError.notFound('That file');
    const inline = INLINE.has(row.mime) && req.query.download === undefined;
    res.setHeader('Content-Type', INLINE.has(row.mime) ? row.mime : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(file).pipe(res);
  }),
);

router.delete(
  '/attachments/:id',
  route((req) => {
    const row = sql.get('SELECT * FROM attachments WHERE id = ?', req.params.id);
    if (!row) return { ok: true };
    if (row.uploader_id !== req.user.id && !req.user.isAdmin) throw HttpError.forbidden('Only the uploader or an admin can remove this file.');
    sql.run('DELETE FROM attachments WHERE id = ?', row.id);
    fs.rm(path.join(uploadDir, row.id), { force: true }, () => {});
    hub.broadcast({ type: 'attachment.delete', id: row.id, taskId: row.task_id });
    syncCount(row.task_id);
    return { ok: true };
  }),
);

export default router;
