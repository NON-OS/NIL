import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes, bytesToNumberBE } from '@noble/curves/abstract/utils';
import HttpError from '../lib/HttpError.js';
import rlpDecode from './rlpDecode.js';
import rlpEncode from './rlpEncode.js';

const MAX_BYTES = 4096;

// Reads a signed EIP-1559 transaction and recovers who signed it, so the server only relays
// transactions from addresses it has a reason to relay for. Nothing else about it is trusted.
export default function rawTransaction(raw) {
  if (typeof raw !== 'string' || !/^0x02[0-9a-fA-F]+$/.test(raw) || raw.length % 2 || raw.length > MAX_BYTES * 2) {
    throw HttpError.badRequest('Only signed EIP-1559 transactions can be sent.');
  }
  const bytes = hexToBytes(raw.slice(2));
  const fields = rlpDecode(bytes.subarray(1));
  if (!Array.isArray(fields) || fields.length !== 12 || fields.slice(0, 8).some(Array.isArray) || !Array.isArray(fields[8])) throw HttpError.badRequest('That transaction isn’t encoded correctly.');

  const [chainId, , , , , to, value, data, , yParity, r, s] = fields;
  const digest = keccak_256(Uint8Array.of(2, ...rlpEncode(fields.slice(0, 9))));
  const bit = Number(bytesToNumberBE(yParity));
  let from;
  try {
    if (bit > 1) throw new Error('parity');
    const point = new secp256k1.Signature(bytesToNumberBE(r), bytesToNumberBE(s)).addRecoveryBit(bit).recoverPublicKey(digest);
    from = `0x${bytesToHex(keccak_256(point.toRawBytes(false).slice(1)).slice(-20))}`;
  } catch {
    throw HttpError.badRequest('That transaction’s signature doesn’t check out.');
  }
  return {
    from,
    chainId: Number(bytesToNumberBE(chainId)),
    to: to.length ? `0x${bytesToHex(to)}` : null,
    value: bytesToNumberBE(value),
    data: `0x${bytesToHex(data)}`,
    hash: `0x${bytesToHex(keccak_256(bytes))}`,
  };
}
