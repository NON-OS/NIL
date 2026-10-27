import express from 'express';
import fs from 'node:fs';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import blobChunk from '../lib/blobChunk.js';
import receiveUpload from '../lib/receiveUpload.js';
import rateLimit from '../auth/rateLimit.js';
import units from '../config/units.js';
import blobScope from '../services/blobScope.js';
import blobSizes from '../services/blobSizes.js';
import dropBlobs from '../services/dropBlobs.js';
import uploadQuota from '../services/uploadQuota.js';

const router = express.Router();
const { uploadsPerHour, chunksPerMinute } = config.sealedBlobs;
// format version and nonce prefix: 8 bytes, 11 characters of base64url
const HEADER = 11;
const TOO_LARGE = 'That file is too large.';
const WRONG_SIZE = 'That part of the file has the wrong size.';

const starts = rateLimit({ windowMs: units.HOUR, max: uploadsPerHour, key: (req) => req.user.id, message: 'You’ve uploaded a lot of files in the last hour. Wait a while and try again.' });
const chunks = rateLimit({ windowMs: units.MINUTE, max: chunksPerMinute, key: (req) => req.user.id, message: 'You’re uploading faster than this server allows. Wait a moment and try again.' });

const info = (blob) => ({ id: blob.id, chunks: blob.chunks, size: blob.size, header: blob.header });

// A blob this person may fetch: finished, in a doc or folder they hold a key to.
function readable(id, user) {
  const blob = sql.get('SELECT * FROM sealed_blobs WHERE id = ? AND finished_at IS NOT NULL', id);
  if (!blob) throw HttpError.notFound('That file');
  blobScope.open(blob.scope_kind, blob.scope_id, user);
  return blob;
}

// An upload this person started and hasn't finished, while they still hold a key to where it goes.
function uploading(id, user) {
  const blob = sql.get('SELECT * FROM sealed_blobs WHERE id = ? AND uploader_id = ? AND finished_at IS NULL', id, user.id);
  if (!blob) throw HttpError.notFound('That upload');
  blobScope.open(blob.scope_kind, blob.scope_id, user);
  return blob;
}

function chunkIndex(blob, value) {
  const index = /^\d{1,9}$/.test(value) ? Number(value) : -1;
  if (index < 0 || index >= blob.chunks) throw HttpError.notFound('That part of the file');
  return index;
}

// Starts an upload: where it goes, its size once encrypted, how many chunks that makes and its
// header. Its full size counts against the quotas from here on, so uploads started together
// can't pass one between them.
router.post(
  '/blobs',
  starts,
  route((req) => {
    const b = req.body ?? {};
    const scope = blobScope.parse(b.scope);
    blobScope.open(scope.kind, scope.id, req.user);
    const size = check.number(b.size, 'Size', { min: 1, integer: true });
    if (size > blobSizes.max) throw new HttpError(413, TOO_LARGE);
    if (!size || b.chunks !== blobSizes.chunks(size)) throw HttpError.badRequest('That size and chunk count don’t fit together.');
    const header = cipherText(b.header, 'Header', { exact: HEADER });
    const release = uploadQuota(req.user, size);
    const id = newId();
    const now = Date.now();
    try {
      sql.run(
        'INSERT INTO sealed_blobs (id, scope_kind, scope_id, uploader_id, header, chunks, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, scope.kind, scope.id, req.user.id, header, b.chunks, size, now, now,
      );
    } finally {
      release();
    }
    return { blob: id };
  }),
);

// One chunk, as raw bytes of exactly the size its place in the blob calls for. It arrives under a
// name of its own and takes its place only if the upload is still open, so sending a chunk again
// after a dropped connection is safe, and a late copy can't touch a finished blob.
router.put(
  '/blobs/:id/chunks/:index',
  chunks,
  route(async (req) => {
    const blob = uploading(req.params.id, req.user);
    const index = chunkIndex(blob, req.params.index);
    const expected = blobSizes.chunk(blob, index);
    const declared = req.headers['content-length'];
    if (declared !== undefined && Number(declared) !== expected) throw new HttpError(Number(declared) > expected ? 413 : 400, WRONG_SIZE);
    const file = blobChunk(blob.id, index);
    const incoming = `${file}.${newId()}.in`;
    try {
      const size = await receiveUpload(req, incoming, { limit: expected, tooLarge: WRONG_SIZE });
      if (size !== expected) throw HttpError.badRequest(WRONG_SIZE);
      sql.tx(() => {
        if (!sql.get('SELECT 1 FROM sealed_blobs WHERE id = ? AND finished_at IS NULL', blob.id)) throw new HttpError(409, 'That upload is already over.');
        fs.renameSync(incoming, file);
        sql.run('INSERT INTO sealed_blob_chunks (blob_id, idx, size) VALUES (?, ?, ?) ON CONFLICT (blob_id, idx) DO UPDATE SET size = excluded.size', blob.id, index, size);
        sql.run('UPDATE sealed_blobs SET updated_at = ? WHERE id = ?', Date.now(), blob.id);
      });
    } finally {
      fs.rmSync(incoming, { force: true });
    }
    return { ok: true };
  }),
);

// Seals the upload once every chunk is in. From then on it never changes.
router.post(
  '/blobs/:id/finish',
  route((req) => {
    const blob = uploading(req.params.id, req.user);
    const got = sql.get('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM sealed_blob_chunks WHERE blob_id = ?', blob.id);
    const onDisk = Array.from({ length: blob.chunks }, (_, i) => fs.existsSync(blobChunk(blob.id, i))).every(Boolean);
    if (got.n !== blob.chunks || got.bytes !== blob.size || !onDisk) throw new HttpError(409, 'Part of the file is missing. Try uploading it again.');
    sql.run('UPDATE sealed_blobs SET finished_at = ?, updated_at = ? WHERE id = ?', Date.now(), Date.now(), blob.id);
    return { blob: info(blob) };
  }),
);

router.get(
  '/blobs/:id',
  route((req) => info(readable(req.params.id, req.user))),
);

// Ciphertext only, so it's never anything a browser could show or run: an opaque download in a
// sandbox that allows nothing.
router.get(
  '/blobs/:id/chunks/:index',
  route((req, res) => {
    const blob = readable(req.params.id, req.user);
    const file = blobChunk(blob.id, chunkIndex(blob, req.params.index));
    if (!fs.existsSync(file)) throw HttpError.notFound('That part of the file');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', fs.statSync(file).size);
    fs.createReadStream(file).pipe(res);
  }),
);

// The uploader, an admin or whoever made the doc or folder may delete a blob. One that a file in
// a folder points at goes with that file instead.
router.delete(
  '/blobs/:id',
  route(async (req) => {
    const blob = sql.get('SELECT * FROM sealed_blobs WHERE id = ?', req.params.id);
    if (!blob) return { ok: true };
    const scope = blobScope.open(blob.scope_kind, blob.scope_id, req.user);
    if (blob.uploader_id !== req.user.id && !req.user.isAdmin && scope.createdBy !== req.user.id) throw HttpError.forbidden('Only whoever uploaded this file, or an admin, can delete it.');
    if (sql.get('SELECT 1 FROM folder_items WHERE blob_id = ? OR thumb_id = ?', blob.id, blob.id)) throw new HttpError(409, 'This file belongs to a folder. Delete it there.');
    await dropBlobs([blob.id]);
    return { ok: true };
  }),
);

export default router;
