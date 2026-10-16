import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import HttpError from '../lib/HttpError.js';
import csvCell from '../lib/csvCell.js';
import hub from '../realtime/hub.js';
import visibleTask from '../services/visibleTask.js';
import publicWorkspace from '../services/publicWorkspace.js';
import toTimeEntry from '../mappers/toTimeEntry.js';

const router = express.Router();
const DAY = 86_400_000;
const LONGEST = 24 * 60 * 60_000;

// Your time log is yours alone: nobody else, admins included, can read it.
const running = (userId) => toTimeEntry(sql.get('SELECT * FROM time_entries WHERE user_id = ? AND ended_at IS NULL', userId));
const announce = (userId) => hub.toUser(userId, { type: 'timer', timer: running(userId) });

function taskRef(req) {
  if (!req.body?.taskId) return null;
  return visibleTask(req.body.taskId, req.user).id;
}

function stop(userId, at = Date.now()) {
  sql.run('UPDATE time_entries SET ended_at = MIN(?, started_at + ?) WHERE user_id = ? AND ended_at IS NULL', at, LONGEST, userId);
}

function range(query) {
  const to = check.number(query.to, 'To', { min: 0, max: 1e14 }) ?? Date.now() + DAY;
  const from = check.number(query.from, 'From', { min: 0, max: 1e14 }) ?? to - 7 * DAY;
  if (to - from > 370 * DAY) throw HttpError.badRequest('Pick a range of a year or less.');
  return { from, to };
}

router.get(
  '/time',
  route((req) => {
    const { from, to } = range(req.query);
    return {
      timer: running(req.user.id),
      entries: sql.all('SELECT * FROM time_entries WHERE user_id = ? AND started_at >= ? AND started_at < ? ORDER BY started_at DESC', req.user.id, from, to).map(toTimeEntry),
    };
  }),
);

// Starting a timer stops whatever was running, so there's never more than one.
router.post(
  '/time/start',
  route((req) => {
    const taskId = taskRef(req);
    const id = newId();
    sql.tx(() => {
      stop(req.user.id);
      sql.run('INSERT INTO time_entries (id, user_id, task_id, note, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, req.user.id, taskId, check.text(req.body?.note, 'Note', { max: 300 }), Date.now(), Date.now());
    });
    announce(req.user.id);
    return { timer: running(req.user.id) };
  }),
);

router.post(
  '/time/stop',
  route((req) => {
    const was = running(req.user.id);
    stop(req.user.id);
    announce(req.user.id);
    return { entry: was ? toTimeEntry(sql.get('SELECT * FROM time_entries WHERE id = ?', was.id)) : null };
  }),
);

// Logging time after the fact, for when the timer wasn't running.
router.post(
  '/time',
  route((req) => {
    const startedAt = check.number(req.body?.startedAt, 'Start', { min: 0, max: 1e14, integer: true });
    const endedAt = check.number(req.body?.endedAt, 'End', { min: 0, max: 1e14, integer: true });
    if (!startedAt || !endedAt || endedAt <= startedAt) throw HttpError.badRequest('The end has to be after the start.');
    if (endedAt - startedAt > LONGEST) throw HttpError.badRequest('One entry can be at most 24 hours.');
    if (startedAt > Date.now()) throw HttpError.badRequest('That’s in the future.');
    const id = newId();
    sql.run('INSERT INTO time_entries (id, user_id, task_id, note, started_at, ended_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, req.user.id, taskRef(req), check.text(req.body?.note, 'Note', { max: 300 }), startedAt, endedAt, Date.now());
    return { entry: toTimeEntry(sql.get('SELECT * FROM time_entries WHERE id = ?', id)) };
  }),
);

router.delete(
  '/time/:id',
  route((req) => {
    sql.run('DELETE FROM time_entries WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    announce(req.user.id);
    return { ok: true };
  }),
);

router.get(
  '/time/export.csv',
  route((req, res) => {
    const { from, to } = range(req.query);
    const { taskPrefix } = publicWorkspace();
    const rows = sql.all(
      `SELECT e.*, t.number, t.title, t.sealed FROM time_entries e LEFT JOIN tasks t ON t.id = e.task_id
       WHERE e.user_id = ? AND e.started_at >= ? AND e.started_at < ? AND e.ended_at IS NOT NULL ORDER BY e.started_at`,
      req.user.id, from, to,
    );
    const lines = [['Start', 'End', 'Minutes', 'Task', 'Title', 'Note'].join(',')];
    for (const r of rows) {
      lines.push([new Date(r.started_at).toISOString(), new Date(r.ended_at).toISOString(), Math.round((r.ended_at - r.started_at) / 60_000), r.number ? `${taskPrefix}-${r.number}` : '', r.sealed ? 'Private task (encrypted)' : r.title ?? '', r.note].map(csvCell).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nil-timesheet.csv"');
    res.send(`﻿${lines.join('\r\n')}`);
  }),
);

export default router;
