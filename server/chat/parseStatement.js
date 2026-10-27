import HttpError from '../lib/HttpError.js';
import parseJSON from '../lib/parseJSON.js';
import config from '../config.js';
import signingKey from '../proofs/signingKey.js';
import factsSigned from './factsSigned.js';

const MAX = 4096;
const KINDS = { leave: 'nil/chat-leave/v1', removal: 'nil/chat-removal/v1' };

// A signed statement as a browser makes one (see chatDeparture in the web app): a leaving of one
// conversation, or a removal from the team. The server checks its shape, that it says what the
// request does and its signature against the key the signer published; every member's browser
// checks the signature again, against the keys it confirmed, before it counts.
export default function parseStatement(raw, { by, kind, channelId, userId }) {
  const value = typeof raw === 'string' && raw.length <= MAX ? parseJSON(raw, null) : null;
  const facts = value?.facts;
  const text = kind === 'leave' ? '' : userId;
  const fits = value?.v === 2 && value.by === by && value.text === text && Array.isArray(facts) && facts.length === 1 && Number.isSafeInteger(facts[0]) && facts[0] > 0 && facts[0] <= Date.now() + config.chat.clockSkewMs;
  if (!fits) throw HttpError.badRequest('That statement isn’t signed the way Nil signs one.');
  const place = kind === 'leave' ? [signingKey.publicKey(), channelId, userId] : [signingKey.publicKey(), userId];
  if (!factsSigned(value, { kind: KINDS[kind], place })) throw HttpError.badRequest('That statement’s signature doesn’t check out.');
  return raw;
}
