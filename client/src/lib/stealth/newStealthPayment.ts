import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { bytesToNumberBE } from '@noble/curves/abstract/utils';

const META = /^st:eth:0x((?:02|03)[0-9a-f]{64})((?:02|03)[0-9a-f]{64})$/;

// A fresh one-time address for a payee (ERC-5564 scheme 1). The ephemeral key is random for
// every payout, so no two payouts to the same person share an address. It never leaves this
// function: with it the server could work out each payout's tweak, and one payout key the payee
// exports would then give away their spending key. Tests pass `pick` to use a fixed key.
export default function newStealthPayment(meta: string, pick: () => Uint8Array = secp256k1.utils.randomPrivateKey) {
  const match = META.exec(meta.toLowerCase());
  if (!match) throw new Error('That person’s private payout key is malformed. Ask them to turn private payouts off and on again.');
  const spend = secp256k1.ProjectivePoint.fromHex(match[1]);
  for (;;) {
    const ephemeral = pick();
    const hashed = keccak_256(secp256k1.getSharedSecret(ephemeral, hexToBytes(match[2]), true));
    const tweak = bytesToNumberBE(hashed);
    const ephemeralPublicKey = `0x${bytesToHex(secp256k1.getPublicKey(ephemeral, true))}`;
    ephemeral.fill(0);
    // out-of-range tweaks are astronomically rare; a new ephemeral key fixes one
    if (tweak === 0n || tweak >= secp256k1.CURVE.n) continue;
    const point = spend.add(secp256k1.ProjectivePoint.BASE.multiply(tweak));
    return {
      address: `0x${bytesToHex(keccak_256(point.toRawBytes(false).slice(1)).slice(-20))}`,
      ephemeralPublicKey,
      viewTag: hashed[0],
    };
  }
}
