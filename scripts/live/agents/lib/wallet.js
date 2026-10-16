import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from '@noble/hashes/utils';

// A throwaway Ethereum account that signs like MetaMask's personal_sign. Pass a saved private
// key (hex) to sign in as the same person again.
export default function wallet(privateKeyHex) {
  const key = privateKeyHex ? hexToBytes(privateKeyHex) : secp256k1.utils.randomPrivateKey();
  const address = `0x${bytesToHex(keccak_256(secp256k1.getPublicKey(key, false).slice(1)).slice(-20))}`;
  return {
    address,
    privateKey: bytesToHex(key),
    sign(message) {
      const body = utf8ToBytes(message);
      const digest = keccak_256(concatBytes(utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`), body));
      const sig = secp256k1.sign(digest, key);
      return `0x${bytesToHex(sig.toCompactRawBytes())}${(sig.recovery + 27).toString(16)}`;
    },
  };
}
