import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secp256k1 } from '@noble/curves/secp256k1';
import metaAddress from '../src/lib/stealth/metaAddress.ts';
import newStealthPayment from '../src/lib/stealth/newStealthPayment.ts';
import stealthKey from '../src/lib/stealth/stealthKey.ts';

// formal/Nil/Stealth.lean proves k·G = S + h·G for k = (s + h) mod n, and that different h give
// different addresses. Here the real payer and payee code check the same on secp256k1.
const spending = secp256k1.utils.randomPrivateKey();
const viewing = secp256k1.utils.randomPrivateKey();
const meta = metaAddress(spending, viewing);

test('the one-time key the payee derives controls the address the payer paid', () => {
  for (let i = 0; i < 5; i++) {
    const payment = newStealthPayment(meta);
    assert.equal(stealthKey(spending, viewing, payment.ephemeralPublicKey).address, payment.address);
  }
});

test('two payouts to the same person go to different addresses', () => {
  const addresses = new Set(Array.from({ length: 8 }, () => newStealthPayment(meta).address));
  assert.equal(addresses.size, 8);
});
