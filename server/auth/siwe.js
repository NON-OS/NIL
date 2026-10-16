import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from '@noble/hashes/utils';
import checksumAddress from '../lib/checksumAddress.js';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;

// Sign-In with Ethereum (EIP-4361). The server writes the whole message, so verifying is
// just recovering the signer and comparing it to the address the message was written for.
const siwe = {
  isAddress: (value) => typeof value === 'string' && ADDRESS.test(value),

  message({ host, origin, address, statement, nonce, chainId, issuedAt, expiresAt }) {
    return [
      `${host} wants you to sign in with your Ethereum account:`,
      checksumAddress(address),
      '',
      statement,
      '',
      `URI: ${origin}`,
      'Version: 1',
      `Chain ID: ${chainId}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
      `Expiration Time: ${expiresAt}`,
    ].join('\n');
  },

  // EIP-191 personal_sign recovery. Returns the lowercase signer address, or null.
  recover(message, signature) {
    if (typeof signature !== 'string' || !SIGNATURE.test(signature)) return null;
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
  },
};

export default siwe;
