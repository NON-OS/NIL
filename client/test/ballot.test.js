import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Base8, addPoint, mulPointEscalar } from '@zk-kit/baby-jubjub';
import serverCommit from '../../server/votes/encrypted/dealingCommit.js';
import serverCheckKnowledge from '../../server/votes/encrypted/checkKnowledge.js';
import identityFromSeed from '../src/lib/crypto/identityFromSeed.ts';
import dealingLine from '../src/lib/ballot/dealingLine.ts';
import dealingCommit from '../src/lib/ballot/dealingCommit.ts';
import dealShares from '../src/lib/ballot/dealShares.ts';
import checkShares from '../src/lib/ballot/checkShares.ts';
import checkKnowledge from '../src/lib/ballot/checkKnowledge.ts';
import votePublicKey from '../src/lib/ballot/votePublicKey.ts';

const trustees = [1, 2, 3].map((position) => ({ position, identity: identityFromSeed(crypto.getRandomValues(new Uint8Array(32))) }));
const recipients = trustees.map((t) => ({ position: t.position, publicKey: t.identity.publicKey }));
const big = (p) => p.map(BigInt);

// one key setup shared by the tests below, since every curve multiplication here is slow
let dealings;
before(async () => {
  dealings = [];
  for (const t of trustees) dealings.push(await dealShares('vote-a', t.position, dealingLine(t.identity.seed, 'vote-a', t.position), recipients));
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
  assert.deepEqual(votePublicKey('vote-a', dealings), expected);
  // a dealing with a commitment nobody proved knowledge of, or a proof from another vote, is refused
  const rogue = { ...dealings[2], commitments: [mulPointEscalar(Base8, 5n).map(String), dealings[2].commitments[1]] };
  assert.equal(votePublicKey('vote-a', [dealings[0], dealings[1], rogue]), null);
  assert.equal(votePublicKey('vote-b', dealings), null);
  assert.equal(votePublicKey('vote-a', [dealings[0], dealings[1], null]), null);
});

test('each trustee checks the shares dealt to them and names a dealer who cheated', async () => {
  assert.equal((await checkShares('vote-a', 1, dealings, trustees[0].identity)).ok, true);
  // trustee 2 deals trustee 3 a share off their committed line
  const cheat = await dealShares('vote-a', 2, dealingLine(trustees[1].identity.seed, 'other', 2), recipients);
  const bad = [dealings[0], { ...dealings[1], shares: { ...dealings[1].shares, 3: cheat.shares[3] } }, dealings[2]];
  assert.deepEqual(await checkShares('vote-a', 3, bad, trustees[2].identity), { ok: false, from: 2 });
});
