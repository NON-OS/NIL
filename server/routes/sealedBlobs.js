import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import blobChunk from '../lib/blobChunk.js';
import receiveUpload from '../lib/receiveUpload.js';
import syncDir from '../lib/syncDir.js';
import rateLimit from '../auth/rateLimit.js';
import blobFinishes from '../auth/blobFinishes.js';
import fileDeletes from '../auth/fileDeletes.js';
import reseals from '../auth/reseals.js';
import units from '../config/units.js';
import blobScope from '../services/blobScope.js';
import blobSizes from '../services/blobSizes.js';
import dropBlobs from '../services/dropBlobs.js';
import uploadQuota from '../services/uploadQuota.js';
import blobReplacement from '../services/blobReplacement.js';
import chunkSlots from '../services/chunkSlots.js';

const router = express.Router();
const { uploadsPerHour, chunksPerMinute, chunkTimeoutMs } = config.sealedBlobs;
// format version and nonce prefix: 8 bytes, 11 characters of base64url
const HEADER = 11;
const TOO_LARGE = 'That file is too large.';
const WRONG_SIZE = 'That part of the file has the wrong size.';

const starts = rateLimit({ windowMs: units.HOUR, max: uploadsPerHour, key: (req) => req.user.id, message: 'You’ve uploaded a lot of files in the last hour. Wait a while and try again.' });
const copies = rateLimit({ windowMs: units.HOUR, max: config.files.resealCopiesPerHour, key: (req) => req.user.id, message: 'You’ve encrypted a lot of files again in the last hour. Wait a while and Nil carries on.' });
// A thumbnail or a file's chunk list goes with a file, so it doesn't count as an upload of its
// own; it has a limit of its own, twice the uploads, since a file has at most one of each. A fresh
// copy of a file being encrypted again counts apart from new uploads too.
const parts = rateLimit({ windowMs: units.HOUR, max: uploadsPerHour * 2, key: (req) => req.user.id, message: 'You’ve uploaded a lot of files in the last hour. Wait a while and try again.' });
const startLimit = (req, res, next) => (req.body?.replaces ? copies : req.body?.part ? parts : starts)(req, res, next);
const PART_MAX = { thumb: config.files.thumbMaxBytes, hashes: blobSizes.hashesMax };
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
//
// A thumbnail or chunk list says which `part` of a file it is, and has to be small. A fresh copy of
// a blob waiting to be encrypted again names the blob it `replaces`, and is charged to nobody's
// quota: it takes that blob's place once it's swapped in.
router.post(
  '/blobs',
  startLimit,
  route(async (req) => {
    const b = req.body ?? {};
    const scope = blobScope.parse(b.scope);
    blobScope.open(scope.kind, scope.id, req.user);
    const size = check.number(b.size, 'Size', { min: 1, integer: true });
    if (size > blobSizes.max) throw new HttpError(413, TOO_LARGE);
    if (!size || b.chunks !== blobSizes.chunks(size)) throw HttpError.badRequest('That size and chunk count don’t fit together.');
    const header = cipherText(b.header, 'Header', { exact: HEADER });
    const part = b.part === undefined || b.part === null ? null : check.oneOf(b.part, ['thumb', 'hashes'], 'Part');
    if (part && size > PART_MAX[part]) throw new HttpError(413, TOO_LARGE);
    const replaces = b.replaces === undefined || b.replaces === null ? null : await blobReplacement(b.replaces, scope, size, req.user);
    const release = replaces ? () => {} : uploadQuota(req.user, size);
    const id = newId();
    const now = Date.now();
    try {
      sql.run(
        'INSERT INTO sealed_blobs (id, scope_kind, scope_id, uploader_id, header, chunks, size, replaces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, scope.kind, scope.id, req.user.id, header, b.chunks, size, replaces, now, now,
      );
    } finally {
      release();
    }
    return { blob: id };
  }),
);

// This person's uploads that haven't finished, with how much of each has arrived, so they can see
// what holds their space and stop what they no longer want. One nobody adds to for
// SEALED_UPLOAD_IDLE_MINUTES goes by itself.
router.get(
  '/blobs',
  route((req) => {
    const rows = sql.all('SELECT b.*, (SELECT COUNT(*) FROM sealed_blob_chunks c WHERE c.blob_id = b.id) AS received FROM sealed_blobs b WHERE b.uploader_id = ? AND b.finished_at IS NULL ORDER BY b.created_at', req.user.id);
    return {
      uploads: rows.map((b) => ({ ...info(b), scope: { kind: b.scope_kind, id: b.scope_id }, received: b.received, replaces: b.replaces, updatedAt: b.updated_at, expiresAt: b.updated_at + config.sealedBlobs.idleMs })),
    };
  }),
);

// Where an upload stands, for a browser carrying on after a dropped connection or a reload: the
// blob as started, and which chunks are in. Only for the person uploading it.
router.get(
  '/blobs/:id/upload',
  route((req) => {
    const blob = uploading(req.params.id, req.user);
    const received = sql.all('SELECT idx FROM sealed_blob_chunks WHERE blob_id = ? ORDER BY idx', blob.id).map((r) => r.idx);
    return { blob: info(blob), received };
  }),
);

// One chunk, as raw bytes of exactly the size its place in the blob calls for. It arrives under a
// name of its own and takes its place only if the upload is still open, so sending a chunk again
// after a dropped connection is safe, and a late copy can't touch a finished blob.
//
// One copy of each chunk at a time, a few per person, each within SEALED_CHUNK_TIMEOUT_SECONDS
// (see chunkSlots). The chunk is on the disk itself, its name included, before the database says
// it arrived, so a power cut can't leave a chunk the database counts but the disk lost.
router.put(
  '/blobs/:id/chunks/:index',
  chunks,
  route(async (req, res) => {
    const blob = uploading(req.params.id, req.user);
    const index = chunkIndex(blob, req.params.index);
    const expected = blobSizes.chunk(blob, index);
    const declared = req.headers['content-length'];
    if (declared !== undefined && Number(declared) !== expected) throw new HttpError(Number(declared) > expected ? 413 : 400, WRONG_SIZE);
    let release;
    try {
      release = chunkSlots.take(req.user.id, blob.id, index);
    } catch (err) {
      res.setHeader('Retry-After', chunkSlots.WAIT_SECONDS);
      throw err;
    }
    const file = blobChunk(blob.id, index);
    const incoming = `${file}.${newId()}.in`;
    try {
      const size = await receiveUpload(req, incoming, { limit: expected, tooLarge: WRONG_SIZE, timeoutMs: chunkTimeoutMs, flush: true });
      if (size !== expected) throw HttpError.badRequest(WRONG_SIZE);
      sql.tx(() => {
        if (!sql.get('SELECT 1 FROM sealed_blobs WHERE id = ? AND finished_at IS NULL', blob.id)) throw new HttpError(409, 'That upload is already over.');
        fs.renameSync(incoming, file);
        syncDir(path.dirname(file));
        sql.run('INSERT INTO sealed_blob_chunks (blob_id, idx, size) VALUES (?, ?, ?) ON CONFLICT (blob_id, idx) DO UPDATE SET size = excluded.size', blob.id, index, size);
        sql.run('UPDATE sealed_blobs SET updated_at = ? WHERE id = ?', Date.now(), blob.id);
      });
    } finally {
      release();
      fs.rmSync(incoming, { force: true });
    }
    return { ok: true };
  }),
);

// Seals the upload once every chunk is in, each with its exact size on disk. From then on it never
// changes.
router.post(
  '/blobs/:id/finish',
  blobFinishes,
  route((req) => {
    const blob = uploading(req.params.id, req.user);
    const got = sql.get('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM sealed_blob_chunks WHERE blob_id = ?', blob.id);
    const onDisk = Array.from({ length: blob.chunks }, (_, i) => fs.statSync(blobChunk(blob.id, i), { throwIfNoEntry: false })?.size === blobSizes.chunk(blob, i)).every(Boolean);
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
    // a blob deleted while it's being read just ends the response
    fs.createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res);
  }),
);

// A doc's fresh copy of a blob takes the old one's place once the doc points at it: the browser
// that encrypted it again changed the doc first. The old blob and any other copies of it go, and
// the copy counts against the quota of whoever uploaded the original. Any key holder may finish
// this, so a tab that closed between changing the doc and swapping the blob is caught up by the
// next one that opens the doc. In a folder the swap happens with the file's new details instead.
router.post(
  '/blobs/:id/adopt',
  reseals,
  route(async (req) => {
    const blob = sql.get('SELECT * FROM sealed_blobs WHERE id = ? AND finished_at IS NOT NULL AND replaces IS NOT NULL', req.params.id);
    if (!blob) throw HttpError.notFound('That copy');
    blobScope.open(blob.scope_kind, blob.scope_id, req.user);
    if (blob.scope_kind !== 'doc') throw HttpError.badRequest('A file in a folder is swapped in with its folder.');
    const old = sql.get("SELECT * FROM sealed_blobs WHERE id = ? AND scope_kind = 'doc' AND scope_id = ? AND reseal = 1", blob.replaces, blob.scope_id);
    if (!old) throw new HttpError(409, 'That file was encrypted again already, or deleted.');
    const others = sql.all('SELECT id FROM sealed_blobs WHERE replaces = ? AND id <> ?', old.id, blob.id).map((r) => r.id);
    sql.run('UPDATE sealed_blobs SET replaces = NULL, uploader_id = ?, updated_at = ? WHERE id = ?', old.uploader_id, Date.now(), blob.id);
    await dropBlobs([old.id, ...others]);
    return { ok: true };
  }),
);

// The uploader, an admin or whoever made the doc or folder may delete a blob. One that a file in
// a folder points at goes with that file instead.
router.delete(
  '/blobs/:id',
  fileDeletes,
  route(async (req) => {
    const blob = sql.get('SELECT * FROM sealed_blobs WHERE id = ?', req.params.id);
    if (!blob) return { ok: true };
    const scope = blobScope.open(blob.scope_kind, blob.scope_id, req.user);
    if (blob.uploader_id !== req.user.id && !req.user.isAdmin && scope.createdBy !== req.user.id) throw HttpError.forbidden('Only whoever uploaded this file, or an admin, can delete it.');
    if (sql.get('SELECT 1 FROM folder_items WHERE blob_id = ? OR thumb_id = ? OR hashes_id = ?', blob.id, blob.id, blob.id)) throw new HttpError(409, 'This file belongs to a folder. Delete it there.');
    await dropBlobs([blob.id]);
    return { ok: true };
  }),
);

export default router;
