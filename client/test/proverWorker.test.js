import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import proveCircuit from '../src/lib/prover/proveCircuit.ts';
import verifyCircuit from '../src/lib/prover/verifyCircuit.ts';
import proverCall from '../src/lib/prover/proverCall.ts';
import inProcessProver from './helpers/inProcessProver.js';

inProcessProver();

// The app and the prover across the message line: a real proof made and checked by the prover,
// with nothing but plain data going either way, and its failures arriving as errors in the app.
const DIR = new URL('../public/zk/privacy-pools/', import.meta.url).pathname;
const KEY = JSON.parse(fs.readFileSync(`${DIR}commitment.vkey`, 'utf8'));
const INPUT = { value: 25_000_000n, label: 42n, nullifier: 7n, secret: 11n };
const prove = (input) => proveCircuit(input, `${DIR}commitment.wasm`, `${DIR}commitment.zkey`);
const decimal = (value) => typeof value === 'string' && /^\d+$/.test(value);

test('a proof comes back as plain decimal strings and the prover verifies it', { timeout: 300_000 }, async () => {
  const { proof, publicSignals } = await prove(INPUT);
  assert.ok(publicSignals.every(decimal));
  assert.ok([proof.pi_a, proof.pi_b.flat(), proof.pi_c].flat().every(decimal));
  assert.equal(publicSignals[2], '25000000');
  assert.equal(await verifyCircuit(KEY, publicSignals, proof), true);

  const tampered = publicSignals.map((s, i) => (i === 2 ? '25000001' : s));
  assert.equal(await verifyCircuit(KEY, tampered, proof), false);
});

test('a proof the prover can’t read is not valid', async () => {
  assert.equal(await verifyCircuit(KEY, ['1'], { pi_a: ['x'] }), false);
});

test('a proof the circuit refuses fails in the app with the prover’s reason', { timeout: 300_000 }, async () => {
  await assert.rejects(prove({ value: INPUT.value, label: INPUT.label, nullifier: INPUT.nullifier }), Error);
});

test('a request the prover doesn’t know is refused', async () => {
  await assert.rejects(proverCall({ op: 'sign' }), /Unknown prover request: sign/);
});
