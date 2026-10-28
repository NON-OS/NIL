import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import docAccess from '../services/docAccess.js';
import notify from '../services/notify.js';
import docMentionWrites from '../auth/docMentionWrites.js';
import units from '../config/units.js';

const MAX_PEOPLE = 20;
// one mention notice per person, doc and author in this long, however often they're @-ed
const QUIET_MS = 10 * units.MINUTE;

// Someone @-mentioned teammates in a doc. The server can't read the doc, so the author's browser
// names who was mentioned; only people who hold the doc's key hear about it, and the notice
// carries the doc's id, never its words.
const router = express.Router();

router.post(
  '/docs/:id/mentions',
  docMentionWrites,
  route((req) => {
    const { doc } = docAccess(req.params.id, req.user);
    const ids = req.body?.userIds;
    if (!Array.isArray(ids) || ids.length > MAX_PEOPLE || !ids.every((id) => typeof id === 'string' && id.length <= 64)) throw HttpError.badRequest('Name up to 20 people.');
    const since = Date.now() - QUIET_MS;
    const told = [];
    for (const userId of new Set(ids)) {
      const reads = sql.get('SELECT 1 FROM doc_keys WHERE doc_id = ? AND user_id = ?', doc.id, userId);
      const recent = sql.get("SELECT 1 FROM notifications WHERE user_id = ? AND actor_id = ? AND type = 'doc_mention' AND json_extract(data, '$.docId') = ? AND created_at > ?", userId, req.user.id, doc.id, since);
      if (reads && !recent && userId !== req.user.id) told.push(userId);
    }
    notify(told, 'doc_mention', null, req.user.id, { docId: doc.id });
    return { told: told.length };
  }),
);

export default router;
