import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Base8, addPoint, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import serverCommit from '../../server/votes/encrypted/dealingCommit.js';
import serverCheckKnowledge from '../../server/votes/encrypted/checkKnowledge.js';
import identityFromSeed from '../src/lib/crypto/identityFromSeed.ts';
import dealingLine from '../src/lib/ballot/dealingLine.ts';
import dealingCommit from '../src/lib/ballot/dealingCommit.ts';
import dealShares from '../src/lib/ballot/dealShares.ts';
import checkShares from '../src/lib/ballot/checkShares.ts';
import checkKnowledge from '../src/lib/ballot/checkKnowledge.ts';
import votePublicKey from '../src/lib/ballot/votePublicKey.ts';
import trusteeStatement from '../src/lib/ballot/trusteeStatement.ts';
import serverStatement from '../../server/votes/encrypted/trusteeStatement.js';
import trusteeSignature from '../src/lib/ballot/trusteeSignature.ts';
import answerComplaint from '../src/lib/ballot/answerComplaint.ts';
import signedDealing from './helpers/signedDealing.js';

const trustees = [1, 2, 3].map((position) => ({ position, userId: `user-${position}`, identity: identityFromSeed(crypto.getRandomValues(new Uint8Array(32))) }));
const recipients = trustees.map((t) => ({ position: t.position, publicKey: t.identity.publicKey }));
const signers = trustees.map((t) => ({ userId: t.userId, signingKey: t.identity.signingKey }));
const signer = (t) => ({ userId: t.userId, signingPrivate: t.identity.signingPrivate });
const big = (p) => p.map(BigInt);

// one key setup shared by the tests below, since every curve multiplication here is slow
let dealings;
before(async () => {
  dealings = [];
  for (const t of trustees) dealings.push(await signedDealing('vote-a', t.position, dealingLine(t.identity.seed, 'vote-a', t.position), recipients, signer(t)));
});

test('a trustee’s line comes back the same after a reload, and differs per vote and seat', () => {
  const { seed } = trustees[0].identity;
  assert.deepEqual(dealingLine(seed, 'v1', 1), dealingLine(Uint8Array.from(seed), 'v1', 1));
  assert.notDeepEqual(dealingLine(seed, 'v1', 1), dealingLine(seed, 'v2', 1));
  assert.notDeepEqual(dealingLine(seed, 'v1', 1), dealingLine(seed, 'v1', 2));
});

test('browser commitments and proofs check out on the server, and the voters’ key is the sum of A0', () => {
  for (const [i, d] of dealings.entries()) assert.equal(dealingCommit('vote-a', i + 1, d.commitments.map(big)), serverCommit('vote-a', i + 1, d.commitments.map(big)));
  const [first] = dealings;
  first.commitments.map(big).forEach((p, k) => {
    assert.equal(checkKnowledge('vote-a', 1, k, p, first.proofs[k]), true);
    assert.equal(serverCheckKnowledge('vote-a', 1, k, p, first.proofs[k]), true);
  });
  const expected = dealings.reduce((sum, d) => addPoint(sum, big(d.commitments[0])), [0n, 1n]).map(String);
  assert.deepEqual(votePublicKey('vote-a', dealings, signers), expected);
  // a dealing with a commitment nobody proved knowledge of, or a proof from another vote, is refused
  const rogue = { ...dealings[2], commitments: [mulPointEscalar(Base8, 5n).map(String), dealings[2].commitments[1]] };
  assert.equal(votePublicKey('vote-a', [dealings[0], dealings[1], rogue], signers), null);
  assert.equal(votePublicKey('vote-b', dealings, signers), null);
  assert.equal(votePublicKey('vote-a', [dealings[0], dealings[1], null], signers), null);
  // so is a trustee in another seat than the one they signed for
  assert.equal(votePublicKey('vote-a', dealings, [signers[1], signers[0], signers[2]]), null);
});

test('browsers and the server write every trustee statement the same way', () => {
  const points = dealings[0].commitments;
  const shares = dealings[0].shares;
  assert.equal(trusteeStatement.sharesDigest(shares), serverStatement.sharesDigest(shares));
  assert.equal(trusteeStatement.commit('vote-a', 1, 'user-1', dealings[0].commitment), serverStatement.commit('vote-a', 1, 'user-1', dealings[0].commitment));
  assert.equal(trusteeStatement.reveal('vote-a', 1, 'user-1', points.map(big), 'ab'), serverStatement.reveal('vote-a', 1, 'user-1', points, 'ab'));
  assert.equal(trusteeStatement.complaint('vote-a', 3, 'user-3', 1), serverStatement.complaint('vote-a', 3, 'user-3', 1));
  assert.equal(trusteeStatement.answer('vote-a', 1, 'user-1', 3, '42'), serverStatement.answer('vote-a', 1, 'user-1', 3, '42'));
});

test('each trustee checks the shares dealt to them and names a dealer who cheated', async () => {
  assert.equal((await checkShares('vote-a', 1, dealings, trustees[0].identity, { signers })).ok, true);
  // trustee 2 deals trustee 3 a share off their committed line, and signs it
  const cheat = await dealShares('vote-a', 2, dealingLine(trustees[1].identity.seed, 'other', 2), recipients);
  const shares = { ...dealings[1].shares, 3: cheat.shares[3] };
  const sharesDigest = trusteeStatement.sharesDigest(shares);
  const signature = trusteeSignature.sign(trusteeStatement.reveal('vote-a', 2, 'user-2', dealings[1].commitments, sharesDigest), trustees[1].identity.signingPrivate);
  const bad = [dealings[0], { ...dealings[1], shares, sharesDigest, signature }, dealings[2]];
  assert.deepEqual(await checkShares('vote-a', 3, bad, trustees[2].identity, { signers }), { ok: false, from: 2 });
  // once trustee 2 shows the real share in answer to the complaint, trustee 3 uses it
  const [a0, a1] = dealingLine(trustees[1].identity.seed, 'vote-a', 2);
  const answered = { 2: ((a0 + a1 * 3n) % subOrder).toString() };
  assert.equal((await checkShares('vote-a', 3, bad, trustees[2].identity, { signers, answered })).ok, true);
  assert.deepEqual(await checkShares('vote-a', 3, bad, trustees[2].identity, { signers, answered: { 2: '5' } }), { ok: false, from: 2 });
});

test('a dealer answers only a complaint its trustee signed', () => {
  const complaint = { accuser: 3, signature: trusteeSignature.sign(trusteeStatement.complaint('vote-a', 3, 'user-3', 2), trustees[2].identity.signingPrivate) };
  const me = { userId: 'user-2', seed: trustees[1].identity.seed, signingPrivate: trustees[1].identity.signingPrivate };
  const answer = answerComplaint('vote-a', 2, me, complaint, signers[2]);
  const [a0, a1] = dealingLine(trustees[1].identity.seed, 'vote-a', 2);
  assert.equal(answer.share, ((a0 + a1 * 3n) % subOrder).toString());
  assert.equal(trusteeSignature.verify(answer.signature, trusteeStatement.answer('vote-a', 2, 'user-2', 3, answer.share), trustees[1].identity.signingKey), true);
  // a complaint the server wrote would make the dealer give away a share for nothing
  assert.throws(() => answerComplaint('vote-a', 2, me, { ...complaint, signature: complaint.signature.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) }, signers[2]), /isn’t signed/);
  assert.throws(() => answerComplaint('vote-a', 2, me, complaint, signers[0]), /isn’t signed/);
});
