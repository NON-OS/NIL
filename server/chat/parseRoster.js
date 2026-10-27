import crypto from 'node:crypto';
import HttpError from '../lib/HttpError.js';
import parseJSON from '../lib/parseJSON.js';
import config from '../config.js';
import signingKey from '../proofs/signingKey.js';
import factsSigned from './factsSigned.js';

const KIND = 'nil/chat-roster/v1';
const HASH = /^[A-Za-z0-9_-]{43}$/;
const sortedIds = (list) => Array.isArray(list) && list.every((id, i) => typeof id === 'string' && id.length > 0 && id.length <= 64 && (i === 0 || list[i - 1] < id));
const same = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
// room for the most members a conversation may have, each named twice, and the rest
const maxChars = () => 4096 + config.chat.maxMembers * 2 * 70;
const hashOf = (raw) => crypto.createHash('sha256').update('nil/chat-roster-hash/v1').update(raw).digest('base64url');

// The member list of one epoch, as the browser that started it signed it (see chatRoster in the
// web app): who holds the epoch's key, who may manage the channel, a hash of the key and one of
// the list before it. The server checks the signature against the key the signer published, that
// it follows the list before it, and the rules every browser checks again with the keys it
// confirmed: a list someone files that browsers would refuse would stall the conversation for
// everyone. `prev` is the list it follows, as stored, or null for the first. Whether the signer
// managed the conversation under the list before comes back as `manager`.
export default function parseRoster(raw, { channel, by, epoch, prev }) {
  if (typeof raw !== 'string' || raw.length > maxChars()) throw HttpError.badRequest('The member list is missing or too long.');
  const value = parseJSON(raw, null);
  const facts = value?.facts;
  if (value?.v !== 2 || value.by !== by || typeof value.sig !== 'string' || value.text !== '' || !Array.isArray(facts) || facts.length !== 7) throw HttpError.badRequest('The member list isn’t signed the way Nil signs one.');
  const [kind, audience, members, managers, key, prevHash, at] = facts;
  const fits =
    kind === channel.kind &&
    audience === channel.audience &&
    sortedIds(members) &&
    members.length <= config.chat.maxMembers &&
    members.includes(by) &&
    sortedIds(managers) &&
    managers.every((id) => members.includes(id)) &&
    (kind === 'channel' || same(managers, members)) &&
    (kind !== 'dm' || members.length === 2) &&
    HASH.test(key) &&
    (prevHash === null || HASH.test(prevHash)) &&
    Number.isSafeInteger(at) &&
    at > 0 &&
    at <= Date.now() + config.chat.clockSkewMs;
  if (!fits) throw HttpError.badRequest('The member list doesn’t fit this conversation.');
  if (!factsSigned(value, { kind: KIND, place: [signingKey.publicKey(), channel.id, epoch] })) throw HttpError.badRequest('The member list’s signature doesn’t check out.');
  if (!prev) {
    if (prevHash !== null || !managers.includes(by)) throw HttpError.badRequest('The first member list has to be signed by whoever manages the conversation.');
    return { members, managers, manager: true, dropped: [] };
  }
  const [, , before, managedBy, , , beforeAt] = parseJSON(prev, {}).facts;
  if (prevHash !== hashOf(prev) || at <= beforeAt) throw new HttpError(409, 'That member list doesn’t follow the one before it. Try again.');
  if (kind === 'dm' && !same(members, before)) throw HttpError.badRequest('A direct message keeps its two people.');
  const manager = managedBy.includes(by);
  if (!manager) {
    const dropped = before.filter((id) => !members.includes(id));
    const added = members.some((id) => !before.includes(id));
    if (!before.includes(by) || !same(managers, managedBy.filter((id) => !dropped.includes(id))) || (added && audience !== 'team')) {
      throw HttpError.forbidden('Only whoever manages this conversation can change who is in it.');
    }
  }
  return { members, managers, manager, dropped: before.filter((id) => !members.includes(id)) };
}
