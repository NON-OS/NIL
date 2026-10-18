import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Identity } from '@semaphore-protocol/identity';
import { ed25519 } from '@noble/curves/ed25519';
import { utf8ToBytes } from '@noble/hashes/utils';
import { subOrder } from '@zk-kit/baby-jubjub';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';
import dealVoteKey from './helpers/dealVoteKey.js';
import trusteeSign from './helpers/trusteeSign.js';
import proveEncrypted from './helpers/proveEncrypted.js';
import castAnonymous from './helpers/castAnonymous.js';
import trusteeStatement from '../votes/encrypted/trusteeStatement.js';
import shareMatches from '../votes/encrypted/shareMatches.js';

// The auditor's proof of concept: ballots were taken before any trustee had checked their shares,
// and one trustee could stop a vote at any time with a complaint nobody could check. Now no
// ballot counts until all three checks are in, a complaint is signed and only possible before
// the first ballot, and the dealer answers it by showing the share for everyone to check.
let srv;
const chain = mockChain();
const base = () => srv.base;
const names = ['owner', 'ana', 'cy'];
const who = Object.fromEntries(names.map((n) => [n, client(base)]));
const wallets = Object.fromEntries(names.map((n) => [n, wallet()]));
const identity = Object.fromEntries(names.map((n) => [n, new Identity(`complaints-${n}`)]));
const ids = {};

before(async () => {
  srv = await startServer({ chain });
  ids.owner = (await who.owner.wallet(wallets.owner, 'setup', { name: 'Owner', workspaceName: 'W' })).data.user.id;
  for (const n of names.slice(1)) {
    const inv = await who.owner('POST', '/api/invites', { role: 'member' });
    ids[n] = (await who[n].wallet(wallets[n], 'invite', { name: n, inviteToken: inv.data.token })).data.user.id;
  }
  for (const n of names) {
    assert.equal((await publishKey(who[n], wallets[n])).status, 200);
    await who[n]('PUT', '/api/me/semaphore', { commitment: identity[n].commitment.toString() });
    chain.setBalance(wallets[n].address, 1000n * 10n ** 18n);
  }
});
after(() => {
  srv.close();
  globalThis.curve_bn128?.terminate();
});

const getVote = async (id) => (await who.owner('GET', '/api/proposals')).data.find((p) => p.id === id);
const newVote = async (title) => (await who.owner('POST', '/api/proposals', { title, options: ['A', 'B'], weighting: 'power', anonymous: true, trustees: [ids.owner, ids.ana, ids.cy] })).data.proposal.id;
const seats = [[1, who.owner], [2, who.ana], [3, who.cy]];
const check = (n, id, body) => who[n]('POST', `/api/proposals/${id}/shares-check`, body);
const complaint = (n, id, position, dealer, signer = who[n].signer) => check(n, id, { ok: false, from: dealer, signature: trusteeSign(signer, trusteeStatement.complaint(id, position, signer.userId, dealer)) });
const answer = (n, id, position, to, share, signer = who[n].signer) => who[n]('POST', `/api/proposals/${id}/share-answer`, { to, share, signature: trusteeSign(signer, trusteeStatement.answer(id, position, signer.userId, to, share)) });
const shareOf = (line, to) => ((line[0] + line[1] * BigInt(to)) % subOrder).toString();

test('no ballot counts before all three checks; a signed complaint waits for the dealer to show the share', async () => {
  const id = await newVote('Answered');
  const { lines, responses } = await dealVoteKey(id, seats);
  assert.ok(responses.every((r) => r.status === 200));
  assert.match((await castAnonymous(srv.base, id, {})).data.error, /checked their key shares/);
  for (const n of ['owner', 'ana']) assert.equal((await check(n, id, { ok: true })).status, 200);

  assert.match((await check('cy', id, { ok: false, from: 1 })).data.error, /Sign the complaint/);
  assert.equal((await complaint('cy', id, 3, 3)).status, 400);
  assert.match((await complaint('cy', id, 3, 1, who.ana.signer)).data.error, /Sign the complaint/);
  assert.equal((await complaint('cy', id, 3, 1)).status, 200);
  let enc = (await getVote(id)).encrypted;
  assert.deepEqual([enc.trustees.map((t) => t.shares), enc.disputed], [['ok', 'ok', 'bad'], false]);
  assert.deepEqual(enc.complaints.map((c) => [c.accuser, c.dealer, c.outcome]), [[3, 1, null]]);
  assert.match((await castAnonymous(srv.base, id, {})).data.error, /checked their key shares/);

  // only the dealer answers, signed, and the server checks the share against their commitments
  assert.equal((await answer('ana', id, 2, 3, shareOf(lines[2], 3))).status, 404);
  assert.match((await answer('owner', id, 1, 3, shareOf(lines[1], 3), who.cy.signer)).data.error, /Sign the answer/);
  assert.deepEqual((await answer('owner', id, 1, 3, shareOf(lines[1], 3))).data, { outcome: 'answered' });
  enc = (await getVote(id)).encrypted;
  assert.deepEqual([enc.trustees.map((t) => t.shares), enc.complaints[0].share], [['ok', 'ok', null], shareOf(lines[1], 3)]);
  // the share is out in the open now and matches, so Cy uses it and checks again
  assert.match((await complaint('cy', id, 3, 1)).data.error, /already showed that share/);
  assert.equal((await check('cy', id, { ok: true })).status, 200);

  const vote = await getVote(id);
  assert.equal((await castAnonymous(srv.base, id, await proveEncrypted(identity.ana, vote, 0))).status, 200);
  // the auditor's last step: a complaint once ballots are in
  for (const [n, position] of [['cy', 3], ['ana', 2]]) assert.equal((await complaint(n, id, position, 1)).status, 409);

  // anyone can check the complaint and the answer from the audit file
  const audit = (await who.owner('GET', `/api/proposals/${id}/audit`)).data;
  const [c] = audit.complaints;
  const key = (position) => Buffer.from(audit.trustees[position - 1].signingKey, 'base64url');
  assert.equal(ed25519.verify(Buffer.from(c.signature, 'base64url'), utf8ToBytes(trusteeStatement.complaint(id, 3, ids.cy, 1)), key(3)), true);
  assert.equal(ed25519.verify(Buffer.from(c.answerSignature, 'base64url'), utf8ToBytes(trusteeStatement.answer(id, 1, ids.owner, 3, c.share)), key(1)), true);
  assert.equal(shareMatches(audit.trustees[0].commitments.map((p) => p.map(BigInt)), 3, c.share), true);
});

test('a dealer whose shown share doesn’t match their commitments stops the vote for good', async () => {
  const id = await newVote('Failed');
  const { lines } = await dealVoteKey(id, seats);
  for (const n of ['owner', 'cy']) await check(n, id, { ok: true });
  assert.equal((await complaint('ana', id, 2, 3)).status, 200);
  const wrong = shareOf(lines[3], 1);
  assert.deepEqual((await answer('cy', id, 3, 2, wrong)).data, { outcome: 'failed' });
  // answering again changes nothing
  assert.deepEqual((await answer('cy', id, 3, 2, shareOf(lines[3], 2))).data, { outcome: 'failed' });
  const enc = (await getVote(id)).encrypted;
  assert.equal(enc.disputed, true);
  assert.deepEqual(enc.complaints.map((c) => [c.accuser, c.dealer, c.outcome, c.share]), [[2, 3, 'failed', wrong]]);
  const refused = await castAnonymous(srv.base, id, {});
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /can’t take ballots/);
  assert.match((await check('ana', id, { ok: true })).data.error, /still open/);
});
