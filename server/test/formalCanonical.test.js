import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// Differential tests for formal/Nil/Canonical.lean. The vectors come from the Lean model; these
// check that BigInt reads and prints numbers the way the model does, and that the ballot checks
// accept a nullifier only in the canonical form the proofs are about.
const vectors = JSON.parse(fs.readFileSync(new URL('../../formal/vectors/canonical.json', import.meta.url)));
const FIELD = BigInt(vectors.fieldOrder);
const FINDING = 'audit finding: a nullifier with leading zeros verifies as the same number but is stored as a separate ballot';

let srv;
const owner = client(() => srv.base);
let config;
let checkBallot;
let checkEncryptedBallot;
before(async () => {
  srv = await startServer();
  ({ default: config } = await import('../config.js'));
  ({ default: checkBallot } = await import('../votes/checkBallot.js'));
  ({ default: checkEncryptedBallot } = await import('../votes/encrypted/checkEncryptedBallot.js'));
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
});
after(() => srv.close());

// why a ballot was refused, or null if it got past every check that runs before the proof
const refusal = async (check) => {
  try {
    await check();
    return null;
  } catch (err) {
    return err.message;
  }
};

// The proof fields are well formed but made for another vote, so a ballot that gets past the
// number checks is refused for its scope. A nullifier refused before that was refused for its form.
const plainBallot = (nullifier) => () =>
  checkBallot({ id: 'formal-vote' }, ['yes', 'no'], {
    merkleTreeDepth: config.semaphore.depth,
    merkleTreeRoot: '1',
    nullifier,
    message: '0',
    scope: '1',
    points: Array(8).fill('1'),
  });

const encryptedBallot = (nullifier) => () => {
  const signals = Array(2 + 4 * 8 + 4).fill('1');
  signals[1] = nullifier;
  return checkEncryptedBallot({ id: 'formal-vote', public_key: '["1","1"]' }, ['yes', 'no'], {
    publicSignals: signals,
    proof: { pi_a: ['1'], pi_b: [['1']], pi_c: ['1'] },
  });
};

const digitStrings = vectors.strings.filter((c) => c.digits);

test('BigInt reads every digit string as the number the model gives it', () => {
  for (const c of digitStrings) assert.equal(BigInt(c.s).toString(), BigInt(c.value).toString(), c.s);
});

test('BigInt prints every number as the canonical string the model prints', () => {
  for (const { n, s } of vectors.printed) assert.equal(BigInt(n).toString(), s);
});

test('canonical in the model means BigInt round-trips the string and it is below the field', () => {
  for (const c of vectors.strings) {
    const reference = c.digits && BigInt(c.s).toString() === c.s && BigInt(c.s) < FIELD;
    assert.equal(reference, c.canonical, JSON.stringify(c.s));
  }
});

test('two canonical strings are the same number only when they are the same string', () => {
  const canonical = vectors.strings.filter((c) => c.canonical);
  for (const a of canonical) for (const b of canonical) assert.equal(BigInt(a.s) === BigInt(b.s), a.s === b.s);
});

test('a canonical nullifier gets past the number checks of both ballot kinds', async () => {
  for (const c of vectors.strings.filter((x) => x.canonical)) {
    assert.match(await refusal(plainBallot(c.s)), /different vote/, c.s);
    assert.match(await refusal(encryptedBallot(c.s)), /different vote/, c.s);
  }
});

test('a string of something other than digits is refused as a nullifier', async () => {
  for (const c of vectors.strings.filter((x) => !x.digits)) {
    assert.doesNotMatch(await refusal(plainBallot(c.s)) ?? 'accepted', /different vote|accepted/, JSON.stringify(c.s));
    assert.doesNotMatch(await refusal(encryptedBallot(c.s)) ?? 'accepted', /different vote|accepted/, JSON.stringify(c.s));
  }
});

// Expected to fail until the canonical-nullifier fix lands on main: today both checks accept any
// 1 to 78 digits. Once it passes, drop the todo so it guards the fix.
test('a digit string that is not canonical is refused as a nullifier', { todo: FINDING }, async () => {
  for (const c of digitStrings.filter((x) => !x.canonical)) {
    assert.doesNotMatch(await refusal(plainBallot(c.s)) ?? 'accepted', /different vote|accepted/, c.s);
    assert.doesNotMatch(await refusal(encryptedBallot(c.s)) ?? 'accepted', /different vote|accepted/, c.s);
  }
});

// Expected to fail until commitments are held to the same rule: today the voting key route takes
// "0" followed by a key, which is the same group member as the key itself under another string.
test('a voting key that is not canonical is refused', { todo: 'audit finding: identity commitments with leading zeros are accepted as a different string for the same key' }, async () => {
  for (const c of digitStrings.filter((x) => !x.canonical)) {
    assert.equal((await owner('PUT', '/api/me/semaphore', { commitment: c.s })).status, 400, c.s);
  }
});
