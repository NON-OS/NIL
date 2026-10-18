import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { groth16 } from 'snarkjs';
import poolPhrase from '../src/lib/pools/poolPhrase.ts';
import masterKeys from '../src/lib/pools/masterKeys.ts';
import poolSecrets from '../src/lib/pools/poolSecrets.ts';
import treeProof from '../src/lib/pools/treeProof.ts';
import proveWithdrawal from '../src/lib/pools/proveWithdrawal.ts';
import proveCommitment from '../src/lib/pools/proveCommitment.ts';
import withdrawalContext from '../src/lib/pools/withdrawalContext.ts';
import serverContext from '../../server/pools/withdrawalContext.js';
import { Group } from '@semaphore-protocol/group';

// Real proofs with the real Privacy Pools circuits (the files this server hosts, pinned to the
// SDK's hashes), checked against the circuits' own verification keys: a withdrawal that leaves
// change behind, and the commitment proof a ragequit needs.
const DIR = new URL('../public/zk/privacy-pools/', import.meta.url).pathname;
const vkey = (name) => JSON.parse(fs.readFileSync(`${DIR}${name}.vkey`, 'utf8'));
const files = (name) => ({ wasm: `${DIR}${name}.wasm`, zkey: `${DIR}${name}.zkey` });
const keys = masterKeys(poolPhrase.toKey('legal winner thank year wave sausage worth useful legal winner thank yellow'));
const SCOPE = 18021368285297593722986850677939473668942851500120722179451099768921996600282n;
const ENTRYPOINT = '0x34a2068192b1297f2a7f85d7d8cde66f8f0921cb';
const LABEL = 6316452312530983954958156091796148311400159161734386852330634622383099210301n;
const VALUE = 25_000_000n;
// snarkjs keeps a curve worker pool alive; the test process can't exit until it's stopped
after(() => globalThis.curve_bn128?.terminate());

const DATA = `0x${'70f88b05fd0a80cc8f6742981668664017fe41a5'.padStart(64, '0')}${'349746ab142b5d0d65899d9bcb6f2cd53ab084d8'.padStart(64, '0')}${(42).toString(16).padStart(64, '0')}`;

test('a withdrawal proof verifies, spends the right nullifier and leaves the right change', { timeout: 300_000 }, async () => {
  const existing = poolSecrets.deposit(keys, SCOPE, 0);
  const next = poolSecrets.withdrawal(keys, LABEL, 0);
  const commitment = poolSecrets.commitment(VALUE, LABEL, existing);
  const stateLeaves = ['11', '22', commitment.toString(), '44', '55'];
  const aspLeaves = ['7', LABEL.toString(), '9'];
  const state = treeProof(stateLeaves, commitment, new Group(stateLeaves.map(BigInt)).root.toString(), 'pool tree');
  const asp = treeProof(aspLeaves, LABEL, new Group(aspLeaves.map(BigInt)).root.toString(), 'association set');
  const context = withdrawalContext(ENTRYPOINT, DATA, SCOPE);
  assert.equal(context, serverContext(ENTRYPOINT, DATA, SCOPE));
  const withdrawn = 10_042_178n;

  const { proof, publicSignals } = await proveWithdrawal({ value: VALUE, label: LABEL, existing, next, withdrawn, context, state, asp }, files('withdraw'));
  assert.ok(await groth16.verify(vkey('withdraw'), publicSignals, { ...proof, protocol: 'groth16', curve: 'bn128' }));
  assert.deepEqual(publicSignals, [
    poolSecrets.commitment(VALUE - withdrawn, LABEL, next).toString(),
    poolSecrets.nullifierHash(existing).toString(),
    withdrawn.toString(),
    state.root.toString(),
    '32',
    asp.root.toString(),
    '32',
    context.toString(),
  ]);
  // the same proof can't be passed off with another amount
  const tampered = publicSignals.map((s, i) => (i === 2 ? String(withdrawn + 1n) : s));
  assert.equal(await groth16.verify(vkey('withdraw'), tampered, { ...proof, protocol: 'groth16', curve: 'bn128' }), false);
});

test('a withdrawal of more than the note holds can’t be proven', { timeout: 300_000 }, async () => {
  const existing = poolSecrets.deposit(keys, SCOPE, 1);
  const commitment = poolSecrets.commitment(5n, LABEL, existing);
  const leaves = [commitment.toString()];
  const tree = treeProof(leaves, commitment, new Group(leaves.map(BigInt)).root.toString(), 'pool tree');
  const asp = treeProof([LABEL.toString()], LABEL, new Group([LABEL]).root.toString(), 'association set');
  await assert.rejects(proveWithdrawal({ value: 5n, label: LABEL, existing, next: poolSecrets.withdrawal(keys, LABEL, 0), withdrawn: 6n, context: 1n, state: tree, asp }, files('withdraw')));
});

test('a ragequit’s commitment proof verifies and names the commitment, nullifier, value and label', { timeout: 300_000 }, async () => {
  const secrets = poolSecrets.deposit(keys, SCOPE, 2);
  const { proof, publicSignals } = await proveCommitment({ value: VALUE, label: LABEL, secrets }, files('commitment'));
  assert.ok(await groth16.verify(vkey('commitment'), publicSignals, { ...proof, protocol: 'groth16', curve: 'bn128' }));
  assert.deepEqual(publicSignals, [poolSecrets.commitment(VALUE, LABEL, secrets).toString(), poolSecrets.nullifierHash(secrets).toString(), VALUE.toString(), LABEL.toString()]);
});
