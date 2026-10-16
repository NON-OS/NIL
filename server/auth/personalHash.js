import { keccak_256 } from '@noble/hashes/sha3';
import { utf8ToBytes, concatBytes } from '@noble/hashes/utils';

// The digest a wallet signs for personal_sign (EIP-191). Plain wallets sign it with their key;
// smart-contract wallets are asked about this same digest through EIP-1271.
export default function personalHash(message) {
  const body = utf8ToBytes(message);
  return keccak_256(concatBytes(utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`), body));
}
