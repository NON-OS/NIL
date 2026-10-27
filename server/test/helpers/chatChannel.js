import crypto from 'node:crypto';

const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');
const chatId = () => blob(16);

// A member list shaped the way a browser signs one, and a sealed key for each person on it. The
// server can't check the signature (browsers do), so a random one stands in.
function roster({ by, kind = 'channel', audience = 'people', members, managers = [by] }) {
  const sorted = [...new Set(members)].sort();
  const facts = [kind, audience, sorted, [...new Set(managers)].sort().filter((m) => sorted.includes(m)), blob(32), null, Date.now()];
  return { roster: JSON.stringify({ by, text: '', sig: blob(64), v: 2, facts }), grants: sorted.map((userId) => ({ userId, wrappedKey: blob(92) })) };
}

// Starts a conversation as `call` (a test client) and returns what the server answered.
async function makeChannel(call, me, { kind = 'channel', audience = 'people', members = [me], keyed = members, managers, metaCt = kind === 'channel' ? blob(60) : null, disappearSeconds = null } = {}) {
  const r = roster({ by: me, kind, audience, members: keyed, managers: managers ?? (kind === 'channel' ? [me] : keyed) });
  return call('POST', '/api/chat/channels', { id: chatId(), kind, audience, members, metaCt, disappearSeconds, ...r });
}

// A message as a browser sends one: ciphertext under the current epoch, with the time now.
// A signed statement shaped the way a browser makes one (a leaving, or a removal from the team).
const statement = (by, text = '') => JSON.stringify({ by, text, sig: blob(64), v: 2, facts: [Date.now()] });

const message = (epoch, extra = {}) => ({ id: chatId(), kind: 'message', epoch, sentAt: Date.now(), bodyCt: blob(200), ttl: null, ...extra });

export default { chatId, roster, makeChannel, message, statement };
