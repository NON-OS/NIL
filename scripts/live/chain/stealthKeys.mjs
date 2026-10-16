import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/abstract/utils';

const { n } = secp256k1.CURVE;
const addressOf = (publicKey) => `0x${bytesToHex(keccak_256(publicKey.slice(1)).slice(-20))}`;

// ERC-5564 scheme 1, written out here separately from the app's own code so a live check tests
// the app against the standard rather than against itself.
const stealthKeys = {
  // st:eth:0x<compressed spending public key><compressed viewing public key>
  meta: (spendingKey, viewingKey) => `st:eth:0x${bytesToHex(secp256k1.getPublicKey(spendingKey, true))}${bytesToHex(secp256k1.getPublicKey(viewingKey, true))}`,

  // What the payee computes from an announcement: the view tag to filter on, and the key of the
  // one-time address (spending key + keccak256(viewingKey · ephemeral public key)).
  open(spendingKey, viewingKey, ephemeralPublicKey) {
    const hashed = keccak_256(secp256k1.getSharedSecret(viewingKey, hexToBytes(ephemeralPublicKey.replace(/^0x/, '')), true));
    const privateKey = numberToBytesBE((bytesToNumberBE(spendingKey) + bytesToNumberBE(hashed)) % n, 32);
    return { privateKey, viewTag: hashed[0], address: addressOf(secp256k1.getPublicKey(privateKey, false)) };
  },

  // The announce(1, stealthAddress, ephemeralPubKey, metadata) call, with the standard's token
  // metadata: view tag, the transfer selector, the token and the amount.
  announceData({ stealthAddress, ephemeralPublicKey, viewTag, token, amount }) {
    const word = (hex) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    const padded = (hex) => hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
    const eph = ephemeralPublicKey.replace(/^0x/, '');
    const meta = `${viewTag.toString(16).padStart(2, '0')}a9059cbb${token.replace(/^0x/, '').toLowerCase()}${word(amount.toString(16))}`;
    const second = 128 + 32 + padded(eph).length / 2;
    return `0x4d1f9583${word('1')}${word(stealthAddress)}${word('80')}${word(second.toString(16))}${word((eph.length / 2).toString(16))}${padded(eph)}${word((meta.length / 2).toString(16))}${padded(meta)}`;
  },
};

export default stealthKeys;
