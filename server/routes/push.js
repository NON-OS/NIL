import express from 'express';
import crypto from 'node:crypto';
import config from '../config.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import tokenHash from '../auth/tokenHash.js';
import sessionCookie from '../auth/sessionCookie.js';
import vapidKeys from '../push/vapidKeys.js';
import pushEndpoint from '../push/pushEndpoint.js';
import subscriptions from '../push/subscriptions.js';
import sendPush from '../push/sendPush.js';

const router = express.Router();

function enabled() {
  if (!config.push.enabled) throw new HttpError(404, 'Push notifications are turned off on this server.');
}

function endpointOf(body) {
  if (typeof body?.endpoint !== 'string' || !body.endpoint) throw HttpError.badRequest('Send the browser’s push endpoint.');
  return body.endpoint;
}

// The browser's own public key must be a real P-256 point, or nothing could ever be encrypted to it.
function keysOf(body) {
  const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth : '';
  const point = Buffer.from(p256dh, 'base64url');
  if (point.length !== 65 || Buffer.from(auth, 'base64url').length !== 16) throw HttpError.badRequest('The browser’s push keys aren’t valid.');
  const probe = crypto.createECDH('prime256v1');
  probe.generateKeys();
  try {
    probe.computeSecret(point);
  } catch (err) {
    if (err.code !== 'ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY') throw err;
    throw HttpError.badRequest('The browser’s push keys aren’t valid.');
  }
  return { p256dh, auth };
}

const settingsOf = (body) => ({
  ...(body?.timeZone !== undefined && body.timeZone !== null ? { timeZone: check.timeZone(body.timeZone) } : {}),
  ...(typeof body?.showNames === 'boolean' ? { showNames: body.showNames } : {}),
});

const state = (userId, row) => ({ device: subscriptions.toDevice(row), devices: subscriptions.count(userId) });

router.get(
  '/push',
  route((req) => ({
    enabled: config.push.enabled,
    publicKey: config.push.enabled ? vapidKeys.publicKey() : null,
    devices: subscriptions.count(req.user.id),
  })),
);

// Turns push on for this browser, or refreshes it: the app sends the subscription again each
// time it opens, which ties it to the current session and keeps the time zone current.
router.put(
  '/push/subscription',
  route((req) => {
    enabled();
    const endpoint = endpointOf(req.body);
    if (!pushEndpoint(endpoint)) throw HttpError.badRequest('This browser’s push service isn’t allowed on this server.');
    const keys = keysOf(req.body);
    let settings = settingsOf(req.body);
    // A browser that swapped its subscription on its own sends the new one in place of the old.
    // It's taken only if the old one was this person's, so nobody inherits someone else's opt-in.
    if (req.body?.replaces !== undefined) {
      const old = typeof req.body.replaces === 'string' ? subscriptions.find(req.user.id, req.body.replaces) : null;
      if (!old) throw HttpError.notFound('That device’s subscription');
      settings = { showNames: Boolean(old.show_names), ...(old.time_zone ? { timeZone: old.time_zone } : {}), ...settings };
      subscriptions.drop(old.id);
    }
    const row = subscriptions.save(req.user.id, tokenHash(sessionCookie.read(req)), { endpoint, ...keys, ...settings });
    return state(req.user.id, row);
  }),
);

router.patch(
  '/push/subscription',
  route((req) => {
    const row = subscriptions.update(req.user.id, endpointOf(req.body), settingsOf(req.body));
    if (!row) throw HttpError.notFound('That device’s subscription');
    return state(req.user.id, row);
  }),
);

router.post(
  '/push/unsubscribe',
  route((req) => {
    subscriptions.remove(req.user.id, endpointOf(req.body));
    return state(req.user.id, null);
  }),
);

// For a lost phone or a shared computer: every device stops at once.
router.delete(
  '/push/subscriptions',
  route((req) => {
    subscriptions.removeAll(req.user.id);
    return state(req.user.id, null);
  }),
);

router.post(
  '/push/test',
  rateLimit({ windowMs: 10 * 60_000, max: 5, key: (req) => req.user.id, message: 'That’s a few tests already. Try again in a few minutes.' }),
  route(async (req) => {
    enabled();
    const row = subscriptions.find(req.user.id, endpointOf(req.body));
    if (!row) throw HttpError.notFound('That device’s subscription');
    const result = await sendPush(row, { title: 'Notifications are on', body: 'This is how Nil reaches you on this device.', tag: 'nil-test' }, { urgency: 'high' });
    if (result === 'gone') subscriptions.drop(row.id);
    if (result !== 'sent') throw new HttpError(502, 'The browser’s push service didn’t take the test. Turn notifications off and on again.');
    return { ok: true };
  }),
);

export default router;
