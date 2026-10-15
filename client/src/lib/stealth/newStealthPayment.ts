import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { bytesToNumberBE } from '@noble/curves/abstract/utils';

const META = /^st:eth:0x((?:02|03)[0-9a-f]{64})((?:02|03)[0-9a-f]{64})$/;

// A fresh one-time address for a payee (ERC-5564 scheme 1). The ephemeral key is random for
// every payout, so no two payouts to the same person share an address.
export default function newStealthPayment(meta: string) {
  const match = META.exec(meta.toLowerCase());
  if (!match) throw new Error('That person’s private payout key is malformed. Ask them to turn private payouts off and on again.');
  const spend = secp256k1.ProjectivePoint.fromHex(match[1]);
  for (;;) {
    const ephemeral = secp256k1.utils.randomPrivateKey();
    const hashed = keccak_256(secp256k1.getSharedSecret(ephemeral, hexToBytes(match[2]), true));
    const tweak = bytesToNumberBE(hashed);
    // out-of-range tweaks are astronomically rare; a new ephemeral key fixes one
    if (tweak === 0n || tweak >= secp256k1.CURVE.n) continue;
    const point = spend.add(secp256k1.ProjectivePoint.BASE.multiply(tweak));
    return {
      address: `0x${bytesToHex(keccak_256(point.toRawBytes(false).slice(1)).slice(-20))}`,
      ephemeralKey: `0x${bytesToHex(ephemeral)}`,
      ephemeralPublicKey: `0x${bytesToHex(secp256k1.getPublicKey(ephemeral, true))}`,
      viewTag: hashed[0],
    };
  }
}
