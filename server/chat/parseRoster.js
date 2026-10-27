import HttpError from '../lib/HttpError.js';
import parseJSON from '../lib/parseJSON.js';
import config from '../config.js';

const HASH = /^[A-Za-z0-9_-]{43}$/;
const sortedIds = (list) => Array.isArray(list) && list.every((id, i) => typeof id === 'string' && id.length > 0 && id.length <= 64 && (i === 0 || list[i - 1] < id));

// The member list of one epoch, as the browser that started it signed it (see chatRoster in the
// web app): who holds the epoch's key, who may manage the channel, a hash of the key and one of
// the list before it. The server can't check the signature against anything a browser would
// trust, so it checks the shape and that the list says what the request does; every member's
// browser checks the signature.
export default function parseRoster(raw, { channel, by }) {
  if (typeof raw !== 'string' || raw.length > 64 * 1024) throw HttpError.badRequest('The member list is missing or too long.');
  const value = parseJSON(raw, null);
  const facts = value?.facts;
  if (value?.v !== 2 || value.by !== by || typeof value.sig !== 'string' || value.text !== '' || !Array.isArray(facts) || facts.length !== 7) throw HttpError.badRequest('The member list isn’t signed the way Nil signs one.');
  const [kind, audience, members, managers, key, prev, at] = facts;
  const fits =
    kind === channel.kind &&
    audience === channel.audience &&
    sortedIds(members) &&
    members.length <= config.chat.maxMembers &&
    members.includes(by) &&
    sortedIds(managers) &&
    managers.every((id) => members.includes(id)) &&
    HASH.test(key) &&
    (prev === null || HASH.test(prev)) &&
    Number.isSafeInteger(at) &&
    at > 0;
  if (!fits) throw HttpError.badRequest('The member list doesn’t fit this conversation.');
  return { members, managers };
}
