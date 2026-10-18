import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import passkeyBody from './helpers/passkeyBody.js';

const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');

let srv;
const base = () => srv.base;
const owner = client(base);
const ana = client(base);
const ben = client(base);
const cat = client(base);
const gus = client(base);
const wallets = { owner: wallet(), ana: wallet(), ben: wallet(), benSpare: wallet(), cat: wallet(), catSpare: wallet(), gus: wallet() };
const ids = {};

before(async () => {
  srv = await startServer();
  ids.owner = (await owner.wallet(wallets.owner, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' })).data.user.id;
  const project = (await owner('POST', '/api/projects', { name: 'Shared' })).data.project.id;
  for (const [who, call, role] of [['ana', ana, 'member'], ['ben', ben, 'member'], ['cat', cat, 'member'], ['gus', gus, 'guest']]) {
    const invite = await owner('POST', '/api/invites', { role, projectIds: [project] });
    ids[who] = (await call.wallet(wallets[who], 'invite', { name: who, inviteToken: invite.data.token })).data.user.id;
  }
  for (const who of ['ana', 'ben']) ids[`${who}Keys`] = (await publishKey({ ana, ben }[who], wallets[who])).sent;
});
after(() => srv.close());

const mine = async (call) => (await call('GET', '/api/bootstrap')).data.passkeys;
const credentialOf = async (call, address) => (await call('GET', '/api/me/credentials')).data.credentials.find((c) => c.address === address).id;

test('adding a passkey needs published keys, and guests have none to add it to', async () => {
  assert.equal((await cat('POST', '/api/me/passkeys', passkeyBody())).status, 409);
  assert.equal((await gus('POST', '/api/me/passkeys', passkeyBody())).status, 403);
  assert.equal((await gus('PUT', '/api/me/recovery-kit', { publicKey: blob(32) })).status, 403);
  assert.deepEqual(await mine(gus), []);
});

test('a passkey is checked for shape and size before it is stored', async () => {
  const bad = [
    'not an object',
    { ...passkeyBody(), credentialId: undefined },
    { ...passkeyBody(), credentialId: 42 },
    { ...passkeyBody(), credentialId: 'has spaces and = signs' },
    // two spellings of the same bytes would let one passkey be stored twice
    { ...passkeyBody(), credentialId: `${blob(16)}x` },
    { ...passkeyBody(), credentialId: blob(15) },
    { ...passkeyBody(), credentialId: blob(1024) },
    { ...passkeyBody(), credentialId: 'A'.repeat(3000) },
    { ...passkeyBody(), salt: blob(31) },
    { ...passkeyBody(), salt: blob(33) },
    { ...passkeyBody(), wrapped: blob(59) },
    { ...passkeyBody(), wrapped: blob(61) },
    { ...passkeyBody(), wrapped: `${blob(57)}!!!!` },
    { ...passkeyBody(), label: '   ' },
    { ...passkeyBody(), label: 'x'.repeat(61) },
    { ...passkeyBody(), label: ['Laptop'] },
  ];
  for (const body of bad) assert.equal((await ana('POST', '/api/me/passkeys', body)).status, 400, JSON.stringify(body).slice(0, 80));
  assert.deepEqual(await mine(ana), []);
  // the longest id WebAuthn allows still fits
  assert.equal((await ana('POST', '/api/me/passkeys', passkeyBody({ credentialId: blob(1023) }))).status, 200);
  assert.equal((await ana('POST', '/api/me/passkeys', passkeyBody({ credentialId: blob(16) }))).status, 200);
  const big = await ana('POST', '/api/me/passkeys', { ...passkeyBody(), padding: 'x'.repeat(1_100_000) });
  assert.equal(big.status, 413);
});

test('each passkey is stored once, up to ten per person', async () => {
  const body = passkeyBody({ label: '  Phone  ' });
  const added = await ana('POST', '/api/me/passkeys', body);
  assert.equal(added.status, 200);
  const stored = added.data.passkeys.find((p) => p.credentialId === body.credentialId);
  assert.deepEqual([stored.salt, stored.wrapped, stored.label, stored.lastUsedAt], [body.salt, body.wrapped, 'Phone', null]);
  assert.equal((await ana('POST', '/api/me/passkeys', { ...body, label: 'Again' })).status, 409);
  // another person may register the same id: it can only ever open their own wrap
  assert.equal((await ben('POST', '/api/me/passkeys', body)).status, 200);
  while ((await mine(ana)).length < 10) assert.equal((await ana('POST', '/api/me/passkeys', passkeyBody())).status, 200);
  const full = await ana('POST', '/api/me/passkeys', passkeyBody());
  assert.equal(full.status, 409);
  assert.match(full.data.error, /up to 10/);
});

test('only the owner of a passkey sees, renames, marks or removes it', async () => {
  const [first] = await mine(ana);
  const bens = JSON.stringify((await ben('GET', '/api/bootstrap')).data);
  assert.ok(!bens.includes(first.credentialId) && !bens.includes(first.salt) && !bens.includes(first.wrapped), 'nothing of Ana’s passkeys reaches Ben');
  const admins = JSON.stringify([(await owner('GET', '/api/bootstrap')).data, (await owner('GET', '/api/export/backup.json')).data, (await owner('GET', '/api/encryption-keys')).data]);
  assert.ok(!admins.includes(first.credentialId) && !admins.includes(first.wrapped), 'nor anything an admin can read');

  for (const call of [ben, owner]) {
    assert.equal((await call('PATCH', `/api/me/passkeys/${first.id}`, { label: 'Taken' })).status, 404);
    assert.equal((await call('POST', `/api/me/passkeys/${first.id}/used`)).status, 404);
    assert.equal((await call('DELETE', `/api/me/passkeys/${first.id}`)).status, 404);
  }
  assert.equal((await gus('DELETE', `/api/me/passkeys/${first.id}`)).status, 403);
  assert.deepEqual((await mine(ana))[0], first);

  assert.equal((await ana('PATCH', `/api/me/passkeys/${first.id}`, { label: '' })).status, 400);
  assert.equal((await ana('PATCH', `/api/me/passkeys/${first.id}`, { label: 'x'.repeat(61) })).status, 400);
  const renamed = await ana('PATCH', `/api/me/passkeys/${first.id}`, { label: 'Old laptop' });
  assert.equal(renamed.data.passkeys.find((p) => p.id === first.id).label, 'Old laptop');
  const used = await ana('POST', `/api/me/passkeys/${first.id}/used`);
  assert.ok(used.data.passkeys.find((p) => p.id === first.id).lastUsedAt >= first.createdAt);
  const removed = await ana('DELETE', `/api/me/passkeys/${first.id}`);
  assert.equal(removed.status, 200);
  assert.ok(!removed.data.passkeys.some((p) => p.id === first.id));
  assert.equal((await ana('DELETE', `/api/me/passkeys/${first.id}`)).status, 404);
});

test('a passkey is never the only way back: a wallet wrap or a saved recovery kit must exist', async () => {
  // Ben's keys are on his first wallet only. A spare wallet without a wrap doesn't count.
  assert.equal((await ben.wallet(wallets.benSpare, 'add')).status, 200);
  const removeFirst = await ben('DELETE', `/api/me/credentials/${await credentialOf(ben, wallets.ben.address)}`);
  assert.equal(removeFirst.status, 409);
  assert.match(removeFirst.data.error, /only way back/);
  assert.equal((await ben('GET', '/api/me/identity-wraps')).data.wraps.length, 1);

  // a kit note has to name the keys Ben has now
  assert.equal((await ben('PUT', '/api/me/recovery-kit', {})).status, 400);
  assert.equal((await ben('PUT', '/api/me/recovery-kit', { publicKey: blob(32) })).status, 409);
  assert.equal((await ben('GET', '/api/bootstrap')).data.recoveryKitAt, null);
  const kit = await ben('PUT', '/api/me/recovery-kit', { publicKey: ids.benKeys.publicKey });
  assert.equal(kit.status, 200);
  assert.equal((await ben('GET', '/api/bootstrap')).data.recoveryKitAt, kit.data.savedAt);
  assert.equal((await ben('DELETE', `/api/me/credentials/${await credentialOf(ben, wallets.ben.address)}`)).status, 200);

  // Cat has keys but no wallet holds them any more and she saved no kit: no passkey yet
  await publishKey(cat, wallets.cat);
  await cat.wallet(wallets.catSpare, 'add');
  assert.equal((await cat('DELETE', `/api/me/credentials/${await credentialOf(cat, wallets.cat.address)}`)).status, 200);
  const refused = await cat('POST', '/api/me/passkeys', passkeyBody());
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /recovery kit/);
});

test('new keys drop every passkey wrap and the kit note, since both hold the old keys', async () => {
  assert.ok((await mine(ben)).length > 0);
  const reset = await publishKey(ben, wallets.benSpare, { reset: true, createdAt: Date.now() + 1000 });
  assert.equal(reset.status, 200);
  const boot = (await ben('GET', '/api/bootstrap')).data;
  assert.deepEqual(boot.passkeys, []);
  assert.equal(boot.recoveryKitAt, null);
  assert.ok((await mine(ana)).length > 0, 'nobody else’s passkeys go');
});

test('the Permissions-Policy header leaves passkeys allowed on this site', async () => {
  const res = await fetch(`${srv.base}/api/auth/state`, { headers: { 'X-NONOS': '1' } });
  const policy = res.headers.get('permissions-policy');
  assert.ok(policy, 'a policy is sent');
  assert.doesNotMatch(policy, /publickey-credentials-(create|get)/);
});
