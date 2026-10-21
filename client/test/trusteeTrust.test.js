import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Identity } from '@semaphore-protocol/identity';
import { addPoint } from '@zk-kit/baby-jubjub';
import groupRoot from '../../server/votes/groupRoot.js';
import proveEncrypted from '../../server/test/helpers/proveEncrypted.js';
import identityFromSeed from '../src/lib/crypto/identityFromSeed.ts';
import dealingLine from '../src/lib/ballot/dealingLine.ts';
import checkShares from '../src/lib/ballot/checkShares.ts';
import votePublicKey from '../src/lib/ballot/votePublicKey.ts';
import verifyBallots from '../src/lib/ballot/verifyBallots.ts';
import voteScope from '../src/lib/ballot/voteScope.ts';
import partialsMade from '../src/state/partialsMade.ts';
import signedDealing from './helpers/signedDealing.js';
import inProcessProver from './helpers/inProcessProver.js';

inProcessProver();

// The auditor's proof of concept against a dishonest server with honest browsers: (1) the server
// deals all three seats itself and every browser check passed, so it held the whole vote key;
// (2) with an honest key setup, it handed two trustees one ballot's ciphertexts as "the sums" and
// had that ballot decrypted. Dealings are now signed by each trustee's pinned key, and trustees
// add up the ballots themselves.
const ID = 'vote-1';
const big = (p) => p.map(BigInt);
const trustees = [1, 2, 3].map((position) => ({ position, userId: `user-${position}`, identity: identityFromSeed(crypto.getRandomValues(new Uint8Array(32))) }));
const recipients = trustees.map((t) => ({ position: t.position, publicKey: t.identity.publicKey }));
// the signing keys each browser pinned for the trustees, by seat
const signers = trustees.map((t) => ({ userId: t.userId, signingKey: t.identity.signingKey }));

const deal = (proposalId, position, line, signer) => signedDealing(proposalId, position, line, recipients, signer);

let honest;
before(async () => {
  honest = [];
  for (const t of trustees) honest.push(await deal(ID, t.position, dealingLine(t.identity.seed, ID, t.position), { userId: t.userId, signingPrivate: t.identity.signingPrivate }));
});
after(() => globalThis.curve_bn128?.terminate?.());

test('a server that deals the seats itself can’t get a voter or a trustee to use its key', async () => {
  const server = identityFromSeed(crypto.getRandomValues(new Uint8Array(32)));
  const made = [];
  for (const t of trustees) made.push(await deal(ID, t.position, [5n + BigInt(t.position), 7n], { userId: t.userId, signingPrivate: server.signingPrivate }));
  assert.equal(votePublicKey(ID, made, signers), null);
  assert.equal(votePublicKey(ID, made), null);
  for (const t of trustees) await assert.rejects(checkShares(ID, t.position, made, t.identity, { signers }), /aren’t all signed/);
  // nor can it swap one seat, or bring a trustee's real dealing over from another vote
  const swapped = [honest[0], made[1], honest[2]];
  assert.equal(votePublicKey(ID, swapped, signers), null);
  const elsewhere = await deal('vote-0', 2, dealingLine(trustees[1].identity.seed, 'vote-0', 2), { userId: 'user-2', signingPrivate: trustees[1].identity.signingPrivate });
  assert.equal(votePublicKey(ID, [honest[0], elsewhere, honest[2]], signers), null);

  // a sealed share changed after its dealer signed, or a dealing for your own seat your browser
  // never made, is the server's doing, so no dealer gets blamed for it
  const resealed = [honest[0], { ...honest[1], shares: { ...honest[1].shares, 3: made[1].shares[3] } }, honest[2]];
  await assert.rejects(checkShares(ID, 3, resealed, trustees[2].identity, { signers }), /isn’t the one its trustee signed/);
  const notMine = await deal(ID, 1, [11n, 13n], { userId: 'user-1', signingPrivate: trustees[0].identity.signingPrivate });
  await assert.rejects(checkShares(ID, 1, [notMine, honest[1], honest[2]], trustees[0].identity, { signers }), /isn’t the one your browser made/);

  // the trustees' own dealings check out everywhere, and the key is the sum of their A0
  const expected = honest.reduce((sum, d) => addPoint(sum, big(d.commitments[0])), [0n, 1n]).map(String);
  assert.deepEqual(votePublicKey(ID, honest, signers), expected);
  for (const t of trustees) assert.equal((await checkShares(ID, t.position, honest, t.identity, { signers })).ok, true);
});

test('a trustee decrypts only the sums of ballots it checked and added up itself, once', async () => {
  const key = votePublicKey(ID, honest, signers);
  const voters = ['a', 'b'].map((n) => new Identity(`trust-voter-${n}`));
  const members = voters.map((v, i) => ({ commitment: v.commitment.toString(), power: String(10 * (i + 1)) }));
  const vote = { id: ID, optionCount: 3, publicKey: key, roots: [groupRoot(members)] };
  const asProven = { anonymous: { members, scope: voteScope(ID) }, options: ['A', 'B', 'C'], encrypted: { publicKey: key } };
  const target = await proveEncrypted(voters[0], asProven, 1);
  const other = await proveEncrypted(voters[1], asProven, 0);
  const at = (b, k) => ({ c1: b.publicSignals.slice(2 + 2 * k, 4 + 2 * k), c2: b.publicSignals.slice(18 + 2 * k, 20 + 2 * k) });
  const sum = (k) => [target, other].reduce((s, b) => ({ c1: addPoint(s.c1, big(at(b, k).c1)), c2: addPoint(s.c2, big(at(b, k).c2)) }), { c1: [0n, 1n], c2: [0n, 1n] });
  const real = [0, 1, 2].map((k) => ({ c1: sum(k).c1.map(String), c2: sum(k).c2.map(String) }));

  // the server's "sums" are one voter's ballot: the trustee's own sums don't match, so nothing is decrypted
  const fake = [0, 1, 2].map((k) => at(target, k));
  await assert.rejects(verifyBallots(vote, [target, other], fake), /aren’t the sums of its ballots/);
  await assert.rejects(verifyBallots(vote, [target, other], real.slice(0, 2)), /aren’t the sums/);
  assert.deepEqual(await verifyBallots(vote, [target, other], real), real);
  // nor does a ballot counted twice, one with a nullifier written another way, or one for another vote
  await assert.rejects(verifyBallots(vote, [target, other, target], real), /appears twice/);
  const padded = { ...target, publicSignals: target.publicSignals.map((v, i) => (i === 1 ? `0${v}` : v)) };
  await assert.rejects(verifyBallots(vote, [padded, other], real), /malformed/);
  await assert.rejects(verifyBallots({ ...vote, id: 'vote-2' }, [target, other], real), /another vote/);
  await assert.rejects(verifyBallots({ ...vote, roots: ['1'] }, [target, other], real), /voter list/);
  const forged = { ...other, publicSignals: other.publicSignals.map((v, i) => (i === 2 ? target.publicSignals[2] : v)) };
  await assert.rejects(verifyBallots(vote, [target, forged], real), /doesn’t verify|malformed/);

  // a partial is given once per vote: the same sums again (a retry) but never other ones
  const digest = partialsMade.digest(real);
  assert.equal(partialsMade.allows(ID, digest), true);
  partialsMade.record(ID, digest);
  assert.equal(partialsMade.allows(ID, digest), true);
  assert.equal(partialsMade.allows(ID, partialsMade.digest(fake)), false);
});
