import crypto from 'node:crypto';
import client from './client.js';
import wallet from './wallet.js';
import publishKey from './publishKey.js';

// One workspace with every kind of caller the authorization matrix asks about. A guest sees the
// project "shared" only, and so do the two agents. "outsider" was a member until an admin removed
// them and still holds their old cookie and personal key; "stranger" brings a cookie and a key
// that were never issued here, as someone signed in to another workspace would.
export default async function authzWorld(base) {
  const people = { owner: client(base), admin: client(base), member: client(base), guest: client(base), outsider: client(base) };
  const wallets = Object.fromEntries(Object.keys(people).map((who) => [who, wallet()]));
  const ids = {};
  const keys = {};
  const { owner } = people;
  ids.owner = (await owner.wallet(wallets.owner, 'setup', { name: 'Olive Owner', workspaceName: 'Matrix' })).data.user.id;
  ids.shared = (await owner('POST', '/api/projects', { name: 'Shared' })).data.project.id;
  ids.board = (await owner('POST', '/api/projects', { name: 'Board' })).data.project.id;
  const join = async (who, role, extra = {}) => {
    const invite = await owner('POST', '/api/invites', { role, ...extra });
    return (await people[who].wallet(wallets[who], 'invite', { name: `${who} person`, inviteToken: invite.data.token })).data.user.id;
  };
  ids.admin = await join('admin', 'admin');
  ids.member = await join('member', 'member');
  ids.guest = await join('guest', 'guest', { projectIds: [ids.shared] });
  ids.outsider = await join('outsider', 'member');
  for (const who of ['owner', 'admin', 'member']) await publishKey(people[who], wallets[who]);

  // personal access keys, for the endpoints that take a bearer key instead of a cookie
  for (const who of Object.keys(people)) keys[who] = (await people[who]('POST', '/api/me/tokens', { name: 'matrix', scope: 'write' })).data.token;
  // The read-only agent is given every tool, so only its access level stands between it and a change.
  const tools = (await owner('GET', '/api/agents')).data.options.tools.map((tool) => tool.name);
  for (const [name, access] of [['agentRead', 'read'], ['agentWrite', 'write']]) {
    const made = await owner('POST', '/api/agents', { name, access, runner: 'external', projectIds: [ids.shared], tools });
    ids[name] = made.data.agent.id;
    keys[name] = made.data.key;
  }
  await owner('PATCH', `/api/users/${ids.outsider}`, { deactivated: true });
  keys.stranger = `nonos_pat_${crypto.randomBytes(32).toString('base64url')}`;
  const strangerCookie = `nonos=${crypto.randomBytes(32).toString('base64url')}`;

  // A second session for one person, for routes that end the session they're called with.
  async function freshCookie(who) {
    const c = client(base);
    const res = await c.wallet(wallets[who], 'login');
    return res.status === 200 ? c.cookie() : people[who].cookie();
  }

  const cookieOf = (who) => (who === 'stranger' ? strangerCookie : people[who]?.cookie() ?? null);
  return { base, people, wallets, ids, keys, cookieOf, freshCookie };
}
