import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import cipherText from '../lib/cipherText.js';
import docAccess from '../services/docAccess.js';
import pendingDocUpdates from '../services/pendingDocUpdates.js';
import docUpdateWrites from '../auth/docUpdateWrites.js';
import hub from '../realtime/hub.js';
import config from '../config.js';

const router = express.Router();

// One live change to a doc, signed and sealed with the doc key in the author's browser. The
// server numbers it, keeps it until a saved version folds it in, and passes it on at once to
// everyone holding the key, the author's other tabs included.
router.post(
  '/docs/:id/updates',
  docUpdateWrites,
  route((req) => {
    const { doc } = docAccess(req.params.id, req.user);
    const updateCt = cipherText(req.body?.updateCt, 'Change', { max: config.docs.updateMaxChars });
    const at = Date.now();
    const seq = sql.tx(() => {
      const { n } = sql.get('SELECT COUNT(*) AS n FROM doc_updates WHERE doc_id = ?', doc.id);
      if (n >= config.docs.pendingUpdates) throw new HttpError(409, 'Save a new version of this doc before sending more changes.');
      const next = sql.get('UPDATE docs SET update_seq = update_seq + 1 WHERE id = ? RETURNING update_seq', doc.id).update_seq;
      sql.run('INSERT INTO doc_updates (doc_id, seq, update_ct, created_by, created_at) VALUES (?, ?, ?, ?, ?)', doc.id, next, updateCt, req.user.id, at);
      return next;
    });
    const event = { type: 'doc-update', docId: doc.id, seq, updateCt, by: req.user.id, at };
    for (const r of sql.all('SELECT user_id FROM doc_keys WHERE doc_id = ?', doc.id)) hub.toUser(r.user_id, event);
    return { seq };
  }),
);

// The changes after `after`. A browser that fell behind further than the newest version reaches
// gets told where that version stops, and reopens the doc instead.
router.get(
  '/docs/:id/updates',
  route((req) => {
    const { doc } = docAccess(req.params.id, req.user);
    const after = check.number(Number(req.query.after ?? 0), 'After', { min: 0, integer: true });
    if (after < doc.updates_through) throw new HttpError(409, 'A newer version of this doc covers those changes. Reopen it.');
    return { updates: pendingDocUpdates(doc.id, after), version: doc.version };
  }),
);

export default router;
