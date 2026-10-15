import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes, numberToBytesBE } from '@noble/curves/abstract/utils';
import rlpEncode from '../../chain/rlpEncode.js';

const int = (n) => (BigInt(n) === 0n ? new Uint8Array() : numberToBytesBE(BigInt(n), Math.ceil(BigInt(n).toString(16).length / 2)));

// Signs an EIP-1559 transaction the way a wallet would, for tests of the relay endpoint.
export default function signTx(privateKey, { chainId = 1, nonce = 0, maxPriorityFeePerGas = 1n, maxFeePerGas = 2n, gas = 21000n, to, value = 0n, data = '0x' }) {
  const fields = [int(chainId), int(nonce), int(maxPriorityFeePerGas), int(maxFeePerGas), int(gas), hexToBytes(to.slice(2)), int(value), hexToBytes(data.slice(2)), []];
  const digest = keccak_256(Uint8Array.of(2, ...rlpEncode(fields)));
  const sig = secp256k1.sign(digest, hexToBytes(privateKey.replace(/^0x/, '')));
  return `0x02${bytesToHex(rlpEncode([...fields, int(sig.recovery), int(sig.r), int(sig.s)]))}`;
}
