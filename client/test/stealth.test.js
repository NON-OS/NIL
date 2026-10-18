import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import newStealthPayment from '../src/lib/stealth/newStealthPayment.ts';
import stealthKey from '../src/lib/stealth/stealthKey.ts';
import metaAddress from '../src/lib/stealth/metaAddress.ts';

const VECTORS = JSON.parse(fs.readFileSync(new URL('../../server/test/fixtures/stealthVectors.json', import.meta.url)));
const bytes = (hex) => hexToBytes(hex.slice(2));

test('the payer’s one-time address and the payee’s key match the ERC-5564 reference byte for byte', () => {
  for (const v of VECTORS) {
    assert.equal(metaAddress(bytes(v.spendingKey), bytes(v.viewingKey)), v.meta);
    const paid = newStealthPayment(v.meta, () => bytes(v.ephemeralKey));
    assert.deepEqual(paid, { address: v.stealthAddress, ephemeralPublicKey: v.ephemeralPublicKey, viewTag: Number(v.viewTag) });
    const opened = stealthKey(bytes(v.spendingKey), bytes(v.viewingKey), v.ephemeralPublicKey);
    assert.equal(opened.address, v.stealthAddress);
    assert.equal(`0x${bytesToHex(opened.privateKey)}`, v.stealthKey);
  }
});

test('a new one-time payment hands back only public values, and wipes its ephemeral key', () => {
  let picked;
  const paid = newStealthPayment(VECTORS[0].meta, () => (picked = bytes(VECTORS[0].ephemeralKey)));
  assert.deepEqual(Object.keys(paid).sort(), ['address', 'ephemeralPublicKey', 'viewTag']);
  assert.ok(picked.every((b) => b === 0));
  assert.notEqual(newStealthPayment(VECTORS[0].meta).address, newStealthPayment(VECTORS[0].meta).address);
});
