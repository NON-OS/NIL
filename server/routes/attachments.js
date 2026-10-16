import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import newId from '../lib/newId.js';
import config from '../config.js';
import uploadDir from '../lib/uploadDir.js';
import stagedFile from '../lib/stagedFile.js';
import HttpError from '../lib/HttpError.js';
import visibleTask from '../services/visibleTask.js';
import toTaskViewers from '../services/toTaskViewers.js';
import publishTask from '../services/publishTask.js';
import logActivity from '../services/logActivity.js';
import incomingFile from '../services/incomingFile.js';
import toAttachment from '../mappers/toAttachment.js';

const router = express.Router();

// Only these render in the browser. Everything else downloads as an opaque file,
// so an uploaded .html or .svg can never run script on our origin.
const INLINE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

const raw = express.raw({ type: () => true, limit: config.maxUploadBytes });

function syncCount(taskId) {
  const { n } = sql.get('SELECT COUNT(*) AS n FROM attachments WHERE task_id = ?', taskId);
  sql.run('UPDATE tasks SET attachment_count = ? WHERE id = ?', n, taskId);
  publishTask(taskId);
}

// Moving a task's files between encrypted and plain is part of changing who sees it, so it's
// left to the same two people.
function privacyHolder(taskId, user) {
  const task = visibleTask(taskId, user);
  if (user.id !== task.creatorId && user.id !== task.assigneeId) throw HttpError.forbidden('Only the person who created this task or its assignee can change who sees it.');
  return task;
}

router.post(
  '/tasks/:id/attachments',
  raw,
  route((req) => {
    const task = visibleTask(req.params.id, req.user);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw HttpError.badRequest('That file is empty.');
    const file = incomingFile(req.headers, task);

    const id = newId();
    fs.writeFileSync(path.join(uploadDir, id), req.body, { mode: 0o600 });
    sql.run(
      'INSERT INTO attachments (id, task_id, uploader_id, filename, mime, size, sealed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id, task.id, req.user.id, file.filename, file.mime, req.body.length, file.sealed ? JSON.stringify(file.sealed) : null, Date.now(),
    );
    const attachment = toAttachment(sql.get('SELECT * FROM attachments WHERE id = ?', id));
    toTaskViewers(task.id, { type: 'attachment', attachment });
    // an encrypted task's history says that a file arrived, never what it's called
    logActivity(task.id, req.user.id, 'attachment', file.sealed ? {} : { filename: file.filename });
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
    visibleTask(row.task_id, req.user, { allowDeleted: true });
    // an encrypted file is only ciphertext here, for the browser to fetch and open itself
    const viewable = !row.sealed && INLINE.has(row.mime);
    const inline = viewable && req.query.download === undefined;
    res.setHeader('Content-Type', viewable ? row.mime : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(file).pipe(res);
  }),
);

// Stages a file's replacement ahead of its task changing who sees it: an encrypted copy before
// the task is sealed, the plain file before it's opened up again. Nothing changes until the
// task does, which swaps every staged copy in at once.
router.put(
  '/attachments/:id/content',
  raw,
  route((req) => {
    const row = sql.get('SELECT * FROM attachments WHERE id = ?', req.params.id);
    if (!row) throw HttpError.notFound('That file');
    privacyHolder(row.task_id, req.user);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw HttpError.badRequest('That file is empty.');
    fs.writeFileSync(stagedFile.path(row.id, !row.sealed), req.body, { mode: 0o600 });
    return { ok: true };
  }),
);

// Throws away what was staged for a change that didn't go through, so plain copies of
// encrypted files don't sit on the server waiting for the hourly sweep.
router.delete(
  '/tasks/:id/attachments/staged',
  route((req) => {
    const task = privacyHolder(req.params.id, req.user);
    for (const { id } of sql.all('SELECT id FROM attachments WHERE task_id = ?', task.id)) stagedFile.discard(id);
    return { ok: true };
  }),
);

router.delete(
  '/attachments/:id',
  route((req) => {
    const row = sql.get('SELECT * FROM attachments WHERE id = ?', req.params.id);
    if (!row) return { ok: true };
    visibleTask(row.task_id, req.user, { allowDeleted: true });
    if (row.uploader_id !== req.user.id && !req.user.isAdmin) throw HttpError.forbidden('Only the uploader or an admin can remove this file.');
    sql.run('DELETE FROM attachments WHERE id = ?', row.id);
    fs.rm(path.join(uploadDir, row.id), { force: true }, () => {});
    stagedFile.discard(row.id);
    toTaskViewers(row.task_id, { type: 'attachment.delete', id: row.id, taskId: row.task_id });
    syncCount(row.task_id);
    return { ok: true };
  }),
);

export default router;
