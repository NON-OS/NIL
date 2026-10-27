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
  if (!Array.isArray(value) || !value.length || value.length > config.calls.maxPeers || !value.every((id) => typeof id === 'string' && ID.test(id))) throw HttpError.badRequest('Pick who to call.');
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
    if (!call.members.has(req.user.id)) throw new HttpError(409, 'Join the call before asking anyone in.');
    const people = userIds(req.body?.userIds);
    if (!people.every(callable)) throw HttpError.badRequest('You can call active members of the team.');
    const rung = callMembership.invite(call, req.user.id, people);
    return { rung, call: callRegistry.view(call) };
  }),
);

// Relay passwords, only for someone who is in this call or may join it, and only for a while.
router.post(
  '/calls/:id/turn',
  byPerson(30),
  route((req) => {
    available();
    const call = callFor(req);
    if (!callRegistry.mayJoin(call, req.user.id) && !call.members.has(req.user.id)) throw HttpError.notFound('That call');
    const direct = callSettings.direct();
    const { turn } = config.calls;
    const relay = turn.configured ? turnCredentials(req.user.id) : null;
    return {
      iceServers: relay ? [{ urls: relay.urls, username: relay.username, credential: relay.credential }] : [],
      policy: direct ? 'all' : 'relay',
      expiresAt: relay?.expiresAt ?? null,
      ttlSeconds: config.calls.turnTtlSeconds,
    };
  }),
);

export default router;
