import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import docAccess from '../services/docAccess.js';
import grantDocKeys from '../services/grantDocKeys.js';
import announceDoc from '../services/announceDoc.js';
import docRecipients from '../services/docRecipients.js';
import hub from '../realtime/hub.js';
import toDoc from '../mappers/toDoc.js';
import contentWrites from '../auth/contentWrites.js';

const router = express.Router();
const KEEP_REVISIONS = 25;

const manager = (doc, user) => doc.created_by === user.id || user.isAdmin;
const readers = (docId) => sql.all('SELECT user_id FROM doc_keys WHERE doc_id = ?', docId).map((r) => r.user_id);

// Your docs, plus team docs you're still waiting for a key to (a teammate's browser hands
// it over the next time they open the doc list).
router.get(
  '/docs',
  route((req) => {
    const mine = sql.all('SELECT d.*, k.wrapped_key FROM docs d JOIN doc_keys k ON k.doc_id = d.id AND k.user_id = ? ORDER BY d.updated_at DESC', req.user.id);
    const waiting = sql.all(
      "SELECT d.id, d.created_by, d.updated_at FROM docs d WHERE d.audience = 'team' AND NOT EXISTS (SELECT 1 FROM doc_keys k WHERE k.doc_id = d.id AND k.user_id = ?) ORDER BY d.updated_at DESC",
      req.user.id,
    );
    return {
      docs: mine.map((row) => toDoc(row, row.wrapped_key, { readers: readers(row.id) })),
      waiting: waiting.map((d) => ({ id: d.id, createdBy: d.created_by, updatedAt: d.updated_at })),
    };
  }),
);

router.get(
  '/docs/:id',
  route((req) => {
    const { doc, wrappedKey } = docAccess(req.params.id, req.user);
    return { doc: toDoc(doc, wrappedKey, { bodyCt: doc.body_ct, readers: readers(doc.id) }) };
  }),
);

router.post(
  '/docs',
  contentWrites,
  route((req) => {
    const b = req.body ?? {};
    const grants = Array.isArray(b.grants) ? b.grants : [];
    if (!grants.some((g) => g?.userId === req.user.id)) throw HttpError.badRequest('Include a key for yourself, or you couldn’t open your own doc.');
    const id = check.text(b.id, 'Doc id', { min: 16, max: 32 });
    if (!/^[A-Za-z0-9_-]+$/.test(id) || sql.get('SELECT 1 FROM docs WHERE id = ?', id)) throw HttpError.badRequest('Pick a fresh doc id.');
    const now = Date.now();
    sql.tx(() => {
      sql.run(
        'INSERT INTO docs (id, title_ct, body_ct, audience, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        id, cipherText(b.titleCt, 'Title', { max: 4000 }), cipherText(b.bodyCt, 'Body'), check.oneOf(b.audience ?? 'team', ['team', 'people'], 'Audience'), req.user.id, req.user.id, now, now,
      );
      grantDocKeys(id, grants, req.user.id);
    });
    announceDoc(id);
    const { doc, wrappedKey } = docAccess(id, req.user);
    return { doc: toDoc(doc, wrappedKey, { bodyCt: doc.body_ct, readers: readers(id) }) };
  }),
);

// Saving is optimistic: send the version you edited, and if someone saved in between you
// get their version back instead of silently overwriting it.
router.put(
  '/docs/:id',
  contentWrites,
  route((req) => {
    const { doc, wrappedKey } = docAccess(req.params.id, req.user);
    const base = check.number(req.body?.baseVersion, 'Version', { min: 1, integer: true });
    if (base !== doc.version) throw new HttpError(409, 'Someone saved a newer version of this doc.');
    const titleCt = cipherText(req.body?.titleCt, 'Title', { max: 4000 });
    const bodyCt = cipherText(req.body?.bodyCt, 'Body');
    const now = Date.now();
    sql.tx(() => {
      sql.run('INSERT OR REPLACE INTO doc_revisions (doc_id, version, title_ct, body_ct, updated_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', doc.id, doc.version, doc.title_ct, doc.body_ct, doc.updated_by, doc.updated_at);
      sql.run('DELETE FROM doc_revisions WHERE doc_id = ? AND version <= ?', doc.id, doc.version - KEEP_REVISIONS);
      sql.run('UPDATE docs SET title_ct = ?, body_ct = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?', titleCt, bodyCt, req.user.id, now, doc.id);
    });
    announceDoc(doc.id);
    const fresh = sql.get('SELECT * FROM docs WHERE id = ?', doc.id);
    return { doc: toDoc(fresh, wrappedKey, { bodyCt: fresh.body_ct, readers: readers(doc.id) }) };
  }),
);

router.post(
  '/docs/:id/grants',
  route((req) => {
    const { doc } = docAccess(req.params.id, req.user);
    if (doc.audience === 'people' && !manager(doc, req.user)) throw HttpError.forbidden('Only the doc’s creator or an admin can share it with more people.');
    grantDocKeys(doc.id, req.body?.grants, req.user.id);
    announceDoc(doc.id);
    return { readers: readers(doc.id) };
  }),
);

// Removing someone means a brand-new doc key: the browser re-encrypts the doc and seals the
// new key for whoever stays. Old revisions used the old key, so they go.
router.post(
  '/docs/:id/rotate',
  contentWrites,
  route((req) => {
    const { doc } = docAccess(req.params.id, req.user);
    if (!manager(doc, req.user)) throw HttpError.forbidden('Only the doc’s creator or an admin can remove people.');
    const base = check.number(req.body?.baseVersion, 'Version', { min: 1, integer: true });
    if (base !== doc.version) throw new HttpError(409, 'Someone saved a newer version of this doc.');
    const grants = Array.isArray(req.body?.grants) ? req.body.grants : [];
    if (!grants.some((g) => g?.userId === req.user.id)) throw HttpError.badRequest('Keep a key for yourself.');
    const before = readers(doc.id);
    sql.tx(() => {
      sql.run(
        'UPDATE docs SET title_ct = ?, body_ct = ?, audience = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?',
        cipherText(req.body?.titleCt, 'Title', { max: 4000 }), cipherText(req.body?.bodyCt, 'Body'), check.oneOf(req.body?.audience ?? doc.audience, ['team', 'people'], 'Audience'), req.user.id, Date.now(), doc.id,
      );
      sql.run('DELETE FROM doc_revisions WHERE doc_id = ?', doc.id);
      grantDocKeys(doc.id, grants, req.user.id, { replace: true });
    });
    announceDoc(doc.id, before);
    return { readers: readers(doc.id) };
  }),
);

router.get(
  '/docs/:id/revisions',
  route((req) => {
    const { doc } = docAccess(req.params.id, req.user);
    return sql.all('SELECT version, title_ct, body_ct, updated_by, created_at FROM doc_revisions WHERE doc_id = ? ORDER BY version DESC', doc.id).map((r) => ({
      version: r.version,
      titleCt: r.title_ct,
      bodyCt: r.body_ct,
      updatedBy: r.updated_by,
      createdAt: r.created_at,
    }));
  }),
);

router.delete(
  '/docs/:id',
  route((req) => {
    const { doc } = docAccess(req.params.id, req.user);
    if (!manager(doc, req.user)) throw HttpError.forbidden('Only the doc’s creator or an admin can delete it.');
    const everyone = docRecipients(doc.id);
    sql.run('DELETE FROM docs WHERE id = ?', doc.id);
    for (const userId of everyone) hub.toUser(userId, { type: 'docs', id: doc.id });
    return { ok: true };
  }),
);

export default router;
