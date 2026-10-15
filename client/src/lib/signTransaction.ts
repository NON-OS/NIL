import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { numberToBytesBE } from '@noble/curves/abstract/utils';
import rlpEncode from './rlpEncode';

const int = (n: bigint | number) => {
  const v = BigInt(n);
  return v === 0n ? new Uint8Array() : numberToBytesBE(v, Math.ceil(v.toString(16).length / 2));
};

// Signs an EIP-1559 transaction in the browser with a key that never leaves it. Used only for
// one-time payout addresses, which no wallet extension knows about.
export default function signTransaction(privateKey: Uint8Array, tx: { chainId: number; nonce: number; maxPriorityFeePerGas: bigint; maxFeePerGas: bigint; gas: bigint; to: string; value: bigint; data: string }) {
  const fields = [int(tx.chainId), int(tx.nonce), int(tx.maxPriorityFeePerGas), int(tx.maxFeePerGas), int(tx.gas), hexToBytes(tx.to.replace(/^0x/, '')), int(tx.value), hexToBytes(tx.data.replace(/^0x/, '')), []];
  const digest = keccak_256(Uint8Array.of(2, ...rlpEncode(fields)));
  const sig = secp256k1.sign(digest, privateKey);
  return `0x02${bytesToHex(rlpEncode([...fields, int(sig.recovery), int(sig.r), int(sig.s)]))}`;
}
