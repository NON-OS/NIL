import express from 'express';
import crypto from 'node:crypto';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import newId from '../lib/newId.js';
import parseJSON from '../lib/parseJSON.js';
import dateText from '../lib/dateText.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import tokenHash from '../auth/tokenHash.js';
import config from '../config.js';
import resetApproval from '../services/resetApproval.js';
import signInAudit from '../services/signInAudit.js';
import notify from '../services/notify.js';

const router = express.Router();
const HOUR = 3_600_000;
const OPEN = 'closed_at IS NULL AND used_at IS NULL AND expires_at > ?';
const waitHours = () => Math.round(config.signIn.ownerResetWaitMs / HOUR);

const one = (id) => sql.get('SELECT * FROM sign_in_resets WHERE id = ?', id);
const openReset = (id) => sql.get(`SELECT * FROM sign_in_resets WHERE id = ? AND ${OPEN}`, id, Date.now());
const toReset = (r) => ({
  id: r.id,
  userId: r.user_id,
  requestedBy: r.requested_by,
  approvedBy: r.approved_by,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  readyAt: r.issued_at ? null : r.ready_at,
  awaitingApproval: !r.issued_at && !r.ready_at,
});
const toEntry = (e) => ({ id: e.id, action: e.action, actorId: e.actor_id, subjectId: e.subject_id, data: parseJSON(e.data, {}), createdAt: e.created_at });

// The token goes out once and only its hash stays. The link's hours start when it's issued,
// so time spent waiting for approval doesn't shorten it.
function issue(id, approvedBy) {
  const token = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  sql.run('UPDATE sign_in_resets SET token_hash = ?, issued_at = ?, approved_by = ?, expires_at = ? WHERE id = ?', tokenHash(token), now, approvedBy, now + config.signIn.resetHours * HOUR, id);
  return token;
}

// The owner being reset and every other owner and admin hear about it, so a request nobody
// expected can be cancelled in time.
function tell(target, requesterId, readyAt) {
  const data = { name: sql.get('SELECT name FROM users WHERE id = ?', requesterId).name, subject: target.name, readyAt };
  notify([target.id], 'sign_in_reset', null, requesterId, { ...data, own: true });
  const admins = sql.all("SELECT id FROM users WHERE role IN ('owner', 'admin') AND deactivated = 0 AND kind = 'human' AND id != ?", target.id);
  notify(admins.map((a) => a.id), 'sign_in_reset', null, requesterId, data);
}

// An approval has to come from an admin a requester couldn't have just made or taken over: one
// who has held the role for the whole wait and whose own sign-in wasn't reset in that time.
function checkApprover(userId, now) {
  const since = now - config.signIn.ownerResetWaitMs;
  const { admin_since: adminSince } = sql.get('SELECT admin_since FROM users WHERE id = ?', userId);
  const resetLately = sql.get('SELECT 1 FROM sign_in_resets WHERE user_id = ? AND used_at > ?', userId, since);
  if (!adminSince || adminSince > since || resetLately) {
    throw HttpError.forbidden(`Approving a reset of an owner takes an admin who has been one for at least ${waitHours()} hours and whose own sign-in wasn’t reset in that time.`);
  }
}

router.get(
  '/sign-in-resets',
  requireAdmin,
  route(() => ({
    resets: sql.all(`SELECT * FROM sign_in_resets WHERE ${OPEN} ORDER BY created_at DESC`, Date.now()).map(toReset),
    log: sql.all('SELECT * FROM sign_in_audit ORDER BY id DESC LIMIT 50').map(toEntry),
  })),
);

// For a member who lost every wallet: a one-time link that lets them link a new one to the
// same account. Resetting an owner needs a second admin, or a wait (see resetApproval).
router.post(
  '/users/:id/sign-in-reset',
  requireAdmin,
  route((req) => {
    const target = sql.get('SELECT id, name, role, kind, deactivated FROM users WHERE id = ?', req.params.id);
    if (!target) throw HttpError.notFound('That person');
    // a link would give whoever opens it a browser session as the agent, which agents never have
    if (target.kind === 'agent') throw HttpError.badRequest('Agents don’t sign in, so there’s nothing to reset. Manage them in Settings → Agents.');
    if (target.id === req.user.id) throw HttpError.badRequest('You can’t reset your own sign-in. While you’re signed in, link a backup wallet under Settings → Sign-in & security instead.');
    if (target.deactivated) throw HttpError.badRequest('Restore their access first, then reset their sign-in.');
    const { needsApproval, waits } = resetApproval(target);
    if (waits && req.body?.acknowledged !== true) {
      throw new HttpError(409, `There’s no other admin to approve resetting an owner’s sign-in. If you go ahead, the link can be made in ${waitHours()} hours, and ${target.name} and the other admins are told so they can cancel it.`);
    }
    return sql.tx(() => {
      const now = Date.now();
      // a new reset replaces any earlier one for the same person
      for (const old of sql.all(`SELECT id FROM sign_in_resets WHERE user_id = ? AND ${OPEN}`, target.id, now)) {
        sql.run('UPDATE sign_in_resets SET closed_at = ? WHERE id = ?', now, old.id);
        signInAudit('reset.cancelled', { actorId: req.user.id, subjectId: target.id, resetId: old.id, replaced: true });
      }
      const id = newId();
      const readyAt = waits ? now + config.signIn.ownerResetWaitMs : null;
      const expiresAt = (readyAt ?? now) + config.signIn.resetHours * HOUR;
      sql.run('INSERT INTO sign_in_resets (id, user_id, requested_by, created_at, expires_at, ready_at) VALUES (?, ?, ?, ?, ?, ?)', id, target.id, req.user.id, now, expiresAt, readyAt);
      if (needsApproval || waits) {
        signInAudit('reset.requested', { actorId: req.user.id, subjectId: target.id, resetId: id, ...(waits && { waits: true }) });
        tell(target, req.user.id, readyAt);
        return { reset: toReset(one(id)) };
      }
      const token = issue(id, null);
      signInAudit('reset.issued', { actorId: req.user.id, subjectId: target.id, resetId: id });
      return { reset: toReset(one(id)), token };
    });
  }),
);

router.post(
  '/sign-in-resets/:id/approve',
  requireAdmin,
  route((req) => {
    const reset = openReset(req.params.id);
    if (!reset) throw HttpError.notFound('That reset request');
    if (reset.issued_at) throw HttpError.badRequest('This reset is already approved.');
    if (reset.requested_by === req.user.id) throw HttpError.forbidden('Another admin has to approve a reset you asked for.');
    if (reset.user_id === req.user.id) throw HttpError.forbidden('You can’t approve a reset of your own sign-in.');
    checkApprover(req.user.id, Date.now());
    return sql.tx(() => {
      const token = issue(reset.id, req.user.id);
      signInAudit('reset.approved', { actorId: req.user.id, subjectId: reset.user_id, resetId: reset.id, requestedBy: reset.requested_by });
      return { reset: toReset(one(reset.id)), token };
    });
  }),
);

// After the wait, the admin who asked makes the link themselves. Nobody else can, so it still
// goes out once, to the person who took responsibility for it.
router.post(
  '/sign-in-resets/:id/link',
  requireAdmin,
  route((req) => {
    const reset = openReset(req.params.id);
    if (!reset) throw HttpError.notFound('That reset');
    if (reset.issued_at) throw HttpError.badRequest('The link for this reset was already made.');
    if (!reset.ready_at) throw HttpError.badRequest('This reset waits for a second admin to approve it.');
    if (reset.requested_by !== req.user.id) throw HttpError.forbidden('Only the admin who asked for this reset can make its link.');
    if (reset.ready_at > Date.now()) throw new HttpError(409, `The link can be made on ${dateText(reset.ready_at)}, unless someone cancels the reset first.`);
    return sql.tx(() => {
      const token = issue(reset.id, null);
      signInAudit('reset.issued', { actorId: req.user.id, subjectId: reset.user_id, resetId: reset.id, unapproved: true });
      return { reset: toReset(one(reset.id)), token };
    });
  }),
);

// Any admin can cancel, including the person being reset if they can still sign in.
router.delete(
  '/sign-in-resets/:id',
  requireAdmin,
  route((req) => {
    const reset = openReset(req.params.id);
    if (!reset) throw HttpError.notFound('That reset');
    sql.tx(() => {
      sql.run('UPDATE sign_in_resets SET closed_at = ? WHERE id = ?', Date.now(), reset.id);
      signInAudit('reset.cancelled', { actorId: req.user.id, subjectId: reset.user_id, resetId: reset.id });
    });
    return { ok: true };
  }),
);

export default router;
