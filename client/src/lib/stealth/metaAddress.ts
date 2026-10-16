import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';

// The public half of your stealth keys, in ERC-5564's "st:eth:0x<spending><viewing>" form.
export default function metaAddress(spendingKey: Uint8Array, viewingKey: Uint8Array) {
  return `st:eth:0x${bytesToHex(secp256k1.getPublicKey(spendingKey, true))}${bytesToHex(secp256k1.getPublicKey(viewingKey, true))}`;
}
