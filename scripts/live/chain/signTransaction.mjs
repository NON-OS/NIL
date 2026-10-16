import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import rlpEncode from '../../../server/chain/rlpEncode.js';

// RLP wants integers as big-endian bytes with no leading zeros, and zero as the empty string.
function int(value) {
  const n = BigInt(value ?? 0);
  if (n === 0n) return new Uint8Array();
  const hex = n.toString(16);
  return hexToBytes(hex.length % 2 ? `0${hex}` : hex);
}

const bytes = (hex) => hexToBytes(String(hex ?? '0x').slice(2).toLowerCase());

// A signed EIP-1559 (type 2) transaction as raw hex, the only kind Nil's relay accepts.
export default function signTransaction(key, tx) {
  const fields = [int(tx.chainId), int(tx.nonce), int(tx.maxPriorityFeePerGas), int(tx.maxFeePerGas), int(tx.gas), tx.to ? bytes(tx.to) : new Uint8Array(), int(tx.value), bytes(tx.data ?? '0x'), []];
  const sig = secp256k1.sign(keccak_256(Uint8Array.of(2, ...rlpEncode(fields))), key);
  return `0x02${bytesToHex(rlpEncode([...fields, int(sig.recovery), int(sig.r), int(sig.s)]))}`;
}
