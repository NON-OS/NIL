import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes, bytesToNumberBE } from '@noble/curves/abstract/utils';
import HttpError from '../lib/HttpError.js';
import parseMeta from './parseMeta.js';

const { n } = secp256k1.CURVE;

// The one-time address a payer's ephemeral key opens for a payee, exactly as ERC-5564 scheme 1
// derives it: shared secret = eph·V (compressed), h = keccak256(secret), address of S + h·G.
// The payee reaches the same h from v·Eph, so only they can compute the key for s + h.
export default function stealthAddress(meta, ephemeralKey) {
  const { spend, view } = parseMeta(meta);
  const eph = /^0x[0-9a-fA-F]{64}$/.test(ephemeralKey ?? '') ? hexToBytes(ephemeralKey.slice(2)) : null;
  if (!eph || !secp256k1.utils.isValidPrivateKey(eph)) throw HttpError.badRequest('The payment’s one-time key is malformed.');

  const hashed = keccak_256(secp256k1.getSharedSecret(eph, view.toRawBytes(true), true));
  const tweak = bytesToNumberBE(hashed);
  // a tweak outside the scalar range happens with odds near 2^-128; the payer just picks a new key
  if (tweak === 0n || tweak >= n) throw HttpError.badRequest('Pick a different one-time key and pay again.');

  const point = spend.add(secp256k1.ProjectivePoint.BASE.multiply(tweak));
  return {
    address: `0x${bytesToHex(keccak_256(point.toRawBytes(false).slice(1)).slice(-20))}`,
    ephemeralPublicKey: `0x${bytesToHex(secp256k1.getPublicKey(eph, true))}`,
    viewTag: hashed[0],
  };
}
