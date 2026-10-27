import express from 'express';
import sql from '../db/sql.js';
import config from '../config.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import rateLimit from '../auth/rateLimit.js';
import requireAdmin from '../auth/requireAdmin.js';
import callRegistry from '../calls/callRegistry.js';
import callMembership from '../calls/callMembership.js';
import callSettings from '../calls/callSettings.js';
import callable from '../calls/callable.js';
import callLimits from '../calls/callLimits.js';
import callBlocks from '../calls/callBlocks.js';
import sfuToken from '../calls/sfuToken.js';
import turnCredentials from '../calls/turnCredentials.js';

const router = express.Router();
const byPerson = (max) => rateLimit({ windowMs: 60_000, max, key: (req) => `calls:${req.user.id}`, message: 'That’s a lot of calls in a short time. Wait a minute and try again.' });
const ID = /^[A-Za-z0-9_-]{1,32}$/;

function available() {
  const status = callSettings.status();
  if (!status.available) throw new HttpError(409, status.reason === 'tor' ? 'Calls don’t work over Tor.' : 'Calls aren’t set up on this server.');
}

// A call this person is in, is being asked into, or may join. Any other id, real or not, gets
// the same answer, so nobody can probe for calls they're not part of.
function callFor(req) {
  const call = ID.test(req.params.id) ? callRegistry.get(req.params.id) : null;
  if (!call || !callRegistry.visibleTo(call, req.user.id)) throw HttpError.notFound('That call');
  return call;
}

function userIds(value) {
  if (!Array.isArray(value) || !value.length || value.length > callLimits.max() || !value.every((id) => typeof id === 'string' && ID.test(id))) throw HttpError.badRequest('Pick who to call.');
  return value;
}

router.get(
  '/calls/settings',
  route(() => callSettings.status()),
);

router.put(
  '/calls/settings',
  requireAdmin,
  route((req) => {
    if (typeof req.body?.direct !== 'boolean') throw HttpError.badRequest('Say whether direct connections are allowed.');
    callSettings.setDirect(req.body.direct, req.user.id);
    return callSettings.status();
  }),
);

// Who may ring this person: blocked teammates, and whether they're taking calls at all.
router.get(
  '/calls/blocks',
  route((req) => callBlocks.of(req.user.id)),
);

router.put(
  '/calls/blocks',
  route((req) => {
    const { dnd, block, unblock } = req.body ?? {};
    if (dnd !== undefined && typeof dnd !== 'boolean') throw HttpError.badRequest('Say whether you take calls.');
    for (const id of [block, unblock]) if (id !== undefined && (typeof id !== 'string' || !ID.test(id) || id === req.user.id)) throw HttpError.badRequest('Pick someone on the team.');
    if (dnd !== undefined) callBlocks.set(req.user.id, callBlocks.everyone, dnd);
    if (block !== undefined && !sql.get('SELECT 1 FROM users WHERE id = ?', block)) throw HttpError.badRequest('Pick someone on the team.');
    if (block !== undefined) callBlocks.set(req.user.id, block, true);
    if (unblock !== undefined) callBlocks.set(req.user.id, unblock, false);
    return callBlocks.of(req.user.id);
  }),
);

// The calls going on that this person can see: theirs, the ones ringing them, and the team's
// project calls.
router.get(
  '/calls',
  route((req) => ({ calls: callRegistry.all().filter((call) => callRegistry.visibleTo(call, req.user.id)).map(callRegistry.view) })),
);

// Starts a call with a person, or a call anyone on the team can join from a project.
router.post(
  '/calls',
  byPerson(config.calls.startsPerMinute),
  route((req) => {
    available();
    const { with: withIds, projectId } = req.body ?? {};
    if (projectId !== undefined) {
      if (typeof projectId !== 'string' || !ID.test(projectId) || !sql.get('SELECT 1 FROM projects WHERE id = ?', projectId)) throw HttpError.notFound('That project');
      const call = callMembership.start({ by: req.user.id, kind: 'project', projectId, invite: withIds === undefined ? [] : userIds(withIds) });
      return { call: callRegistry.view(call) };
    }
    const people = userIds(withIds);
    if (people.includes(req.user.id) || !people.every(callable)) throw HttpError.badRequest('You can call active members of the team.');
    const call = callMembership.start({ by: req.user.id, kind: 'person', invite: people });
    return { call: callRegistry.view(call) };
  }),
);

// Rings more people into a call this person is in.
router.post(
  '/calls/:id/invite',
  byPerson(config.calls.startsPerMinute * 4),
  route((req) => {
    const call = callFor(req);
    if (!callRegistry.member(call, req.user.id)) throw new HttpError(409, 'Join the call before asking anyone in.');
    const people = userIds(req.body?.userIds);
    if (!people.every(callable)) throw HttpError.badRequest('You can call active members of the team.');
    const rung = callMembership.invite(call, req.user.id, people);
    return { rung, call: callRegistry.view(callRegistry.get(call.id)) };
  }),
);

// Relay passwords, only for someone who is in this call or may join it, and only for a while.
router.post(
  '/calls/:id/turn',
  byPerson(30),
  route((req) => {
    available();
    const call = callFor(req);
    if (!callRegistry.mayJoin(call, req.user.id)) throw HttpError.notFound('That call');
    const direct = callSettings.direct();
    const { turn } = config.calls;
    const relay = turn.configured ? turnCredentials(req.user.id, call.id) : null;
    // with direct connections allowed, browsers also need to learn their own public address,
    // from the relay's STUN side or STUN_URLS, or they could only ever connect on one network
    const stun = direct ? [...new Set([...config.calls.stunUrls, ...turn.urls.filter((u) => u.startsWith('turn:')).map((u) => u.replace(/^turn:/, 'stun:').replace(/\?.*$/, ''))])] : [];
    return {
      iceServers: [...(relay ? [{ urls: relay.urls, username: relay.username, credential: relay.credential }] : []), ...(stun.length ? [{ urls: stun }] : [])],
      policy: direct ? 'all' : 'relay',
      expiresAt: relay?.expiresAt ?? null,
      ttlSeconds: config.calls.turnTtlSeconds,
    };
  }),
);

// A room token for the SFU, for someone in a call that moved there, for the tab they joined from.
router.post(
  '/calls/:id/sfu',
  byPerson(30),
  route((req) => {
    available();
    const call = callFor(req);
    const person = callRegistry.member(call, req.user.id);
    if (!person) throw new HttpError(409, 'Join the call first.');
    if (call.mode !== 'sfu' || !config.calls.sfu) throw new HttpError(409, 'This call goes browser to browser.');
    const { url, token, identity } = sfuToken({ callId: call.id, userId: req.user.id, session: person.session });
    return { url, token, identity };
  }),
);

export default router;
