import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The ballot verification key the server checks proofs with has to come out of a real phase 2.
// Equal gamma and delta mean it never did, and then anyone could forge a ballot proof.
const key = JSON.parse(fs.readFileSync(new URL('../votes/ballotKey.json', import.meta.url)));
const record = JSON.parse(fs.readFileSync(new URL('../../circuits/CEREMONY.json', import.meta.url)));

test('the ballot key went through phase 2: gamma and delta differ', () => {
  assert.equal(key.protocol, 'groth16');
  assert.notDeepEqual(key.vk_gamma_2, key.vk_delta_2);
});

test('the ballot key matches the prover key the ceremony record names', async () => {
  const { createHash } = await import('node:crypto');
  const zkey = fs.readFileSync(new URL('../../client/public/zk/ballot.zkey', import.meta.url));
  assert.equal(createHash('sha256').update(zkey).digest('hex'), record.artifacts.zkey);
});
