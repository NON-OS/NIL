import express from 'express';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import archivedTasks from '../services/archivedTasks.js';
import archiveSummary from '../services/archiveSummary.js';

const router = express.Router();

const PAGE = 200;
const MAX_PAGE = 1000;
const MAX_IDS = 100;
const MAX_WORDS = 6;

// The time the app's own archive starts at, from its bootstrap. Every request names it, so
// pages stay consistent with what the app already holds.
function before(value) {
  const n = Number(value);
  if (!/^\d{1,16}$/.test(String(value ?? '')) || !Number.isSafeInteger(n)) throw HttpError.badRequest('Say where the archive starts, as before=<time in ms>.');
  return n;
}

// "<updated_at>.<id>", as the previous page handed it out
function cursor(value) {
  if (value === undefined || value === '') return null;
  const match = /^(\d{1,16})\.([\w-]{0,32})$/.exec(String(value));
  if (!match) throw HttpError.badRequest('That page cursor isn’t one Nil handed out.');
  return { updatedAt: Number(match[1]), id: match[2] };
}

// A search matches titles holding every word, or the task whose key ("NON-12", "12") it names.
// Without one, `number` alone picks a task, as opening a link to an archived task does.
function lookup(query) {
  if (query.q === undefined) return { words: null, number: check.number(query.number, 'Task number', { min: 1, integer: true }) };
  const text = check.text(query.q, 'Search', { max: 100 });
  const key = /^(?:[a-z0-9]+-)?(\d{1,9})$/i.exec(text);
  return { words: text.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS), number: key ? Number(key[1]) : null };
}

function idList(value) {
  if (value === undefined || value === '') return null;
  const ids = String(value).split(',').filter((id) => /^[\w-]{1,32}$/.test(id));
  if (!ids.length || ids.length > MAX_IDS) throw HttpError.badRequest(`Ask for between 1 and ${MAX_IDS} tasks at a time.`);
  return ids;
}

router.get(
  '/tasks/archive',
  route((req) => {
    const q = req.query;
    return archivedTasks(req.user.id, {
      before: before(q.before),
      cursor: cursor(q.cursor),
      ...lookup(q),
      sealed: q.sealed === '1',
      bounty: q.bounty === '1',
      ids: idList(q.ids),
      dueFrom: check.date(q.dueFrom, 'From'),
      dueTo: check.date(q.dueTo, 'To'),
      limit: check.number(q.limit, 'Page size', { min: 1, max: MAX_PAGE, integer: true }) ?? PAGE,
    });
  }),
);

router.get(
  '/tasks/archive/summary',
  route((req) => archiveSummary(req.user.id, before(req.query.before), { labels: req.query.labels === '1' })),
);

export default router;
