import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Base8, addPoint, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import aggregateBallots from '../votes/encrypted/aggregateBallots.js';
import combineTotals from '../votes/encrypted/combineTotals.js';

// Differential tests for formal/Nil/Tally.lean: real Baby Jubjub ciphertexts, summed by
// aggregateBallots and decrypted by combineTotals from two trustees' partials, using the key
// shares and totals the Lean model computed.
const vectors = JSON.parse(fs.readFileSync(new URL('../../formal/vectors/tally.json', import.meta.url)));
const mod = (n) => ((n % subOrder) + subOrder) % subOrder;
// m can be any whole number; m·G for negative m is −(|m|·G), but the vectors only use m ≥ 0
const times = (n, p) => (n === 0n ? [0n, 1n] : mulPointEscalar(p, n));

test('the model uses the same subgroup order as the curve library', () => {
  assert.equal(BigInt(vectors.subOrder), subOrder);
});

test('the Lagrange coefficients the model gives recombine any two shares into the key', () => {
  for (const c of vectors.cases) {
    const shares = c.shares.map(BigInt);
    for (const p of c.pairs) {
      const [a, b] = [Number(p.a), Number(p.b)];
      assert.equal(mod(BigInt(p.la) * shares[a - 1] + BigInt(p.lb) * shares[b - 1]), BigInt(c.x));
      assert.equal(BigInt(p.combined), BigInt(c.x));
    }
  }
});

test('any two of three trustees decrypt the summed ballots to the totals the model gives', () => {
  for (const c of vectors.cases) {
    const H = times(BigInt(c.x), Base8);
    const ballots = c.ballots.map((options) =>
      options.map(({ m, r }) => {
        const [mm, rr] = [BigInt(m), BigInt(r)];
        return { c1: times(rr, Base8).map(String), c2: addPoint(times(mm, Base8), times(rr, H)).map(String) };
      }),
    );
    const sums = aggregateBallots(ballots, c.totals.length);
    const totals = c.totals.map(BigInt);
    const bound = totals.reduce((s, t) => s + t, 0n) + 1n;
    for (const p of c.pairs) {
      const partial = (position) => ({ position, d: sums.map((s) => times(BigInt(c.shares[position - 1]), s.c1)) });
      assert.deepEqual(combineTotals(sums, [partial(Number(p.a)), partial(Number(p.b))], bound), totals, `trustees ${p.a} and ${p.b}`);
    }
  }
});
