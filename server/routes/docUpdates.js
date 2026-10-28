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
import units from '../config/units.js';
import byteBudget from '../services/byteBudget.js';
import docLiveReaders from '../services/docLiveReaders.js';

const router = express.Router();
const sent = byteBudget(units.MINUTE);

// One live change to a doc, signed and sealed with the doc key in the author's browser. The
// server numbers it, keeps it until a saved version folds it in, and passes it on at once to
// everyone holding the key, the author's other tabs included.
router.post(
  '/docs/:id/updates',
  docUpdateWrites,
  route((req) => {
    const { doc } = docAccess(req.params.id, req.user);
    const updateCt = cipherText(req.body?.updateCt, 'Change', { max: config.docs.updateMaxChars });
    const size = updateCt.length;
    if (!sent.take(req.user.id, size, config.docs.updateBytesPerMinute)) throw new HttpError(429, 'You’ve sent a lot of changes in the last minute. They’ll be saved as a new version instead.');
    const at = Date.now();
    const seq = sql.tx(() => {
      const { n } = sql.get('SELECT COUNT(*) AS n FROM doc_updates WHERE doc_id = ?', doc.id);
      const { pending_bytes: bytes } = sql.get('SELECT pending_bytes FROM docs WHERE id = ?', doc.id);
      if (n >= config.docs.pendingUpdates || bytes + size > config.docs.pendingBytes) throw new HttpError(409, 'Save a new version of this doc before sending more changes.');
      const next = sql.get('UPDATE docs SET update_seq = update_seq + 1, pending_bytes = pending_bytes + ? WHERE id = ? RETURNING update_seq', size, doc.id).update_seq;
      sql.run('INSERT INTO doc_updates (doc_id, seq, update_ct, created_by, created_at, size) VALUES (?, ?, ?, ?, ?, ?)', doc.id, next, updateCt, req.user.id, at, size);
      return next;
    });
    // a small change travels with the event; a big one is fetched by the tabs that have the doc
    // open, so a paste isn't copied out to every member's every tab
    const inline = size <= config.docs.liveInlineChars ? { updateCt } : {};
    hub.toUsers(docLiveReaders(doc.id), { type: 'doc-update', docId: doc.id, seq, by: req.user.id, at, ...inline });
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
    return { ...pendingDocUpdates(doc.id, after), version: doc.version };
  }),
);

export default router;
