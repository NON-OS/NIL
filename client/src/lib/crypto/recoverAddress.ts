import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

// The lowercase address behind a personal_sign (EIP-191) signature, or null if it doesn't parse.
export default function recoverAddress(message: string, signature: string): string | null {
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
  try {
    const body = utf8ToBytes(message);
    const digest = keccak_256(concatBytes(utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`), body));
    const raw = hexToBytes(signature.slice(2));
    const v = raw[64] >= 27 ? raw[64] - 27 : raw[64];
    const point = secp256k1.Signature.fromCompact(raw.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(digest);
    return `0x${bytesToHex(keccak_256(point.toRawBytes(false).slice(1)).slice(-20))}`;
  } catch {
    return null;
  }
}
