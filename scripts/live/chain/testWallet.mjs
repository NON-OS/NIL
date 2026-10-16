import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import signTransaction from './signTransaction.mjs';
import personalSign from './personalSign.mjs';
import calls from './calls.mjs';

// One gwei: enough for any mainnet-like pool to take the transaction, and nothing on a local chain.
const TIP = 1_000_000_000n;

// A plain wallet with its own key, as a person's browser wallet would be. Every transaction is
// signed here and sent raw, so the node sees exactly what it would see from MetaMask.
export default function testWallet(rpc, key = secp256k1.utils.randomPrivateKey()) {
  const address = `0x${bytesToHex(keccak_256(secp256k1.getPublicKey(key, false).slice(1)).slice(-20))}`;

  async function sign({ to, data = '0x', value = 0n, gas = null, nonce = null }) {
    const [chainId, count, block] = await Promise.all([rpc('eth_chainId'), nonce ?? rpc('eth_getTransactionCount', [address, 'pending']), rpc('eth_getBlockByNumber', ['latest', false])]);
    const estimate = gas ?? (BigInt(await rpc('eth_estimateGas', [{ from: address, to, data, value: `0x${BigInt(value).toString(16)}` }])) * 6n) / 5n;
    return signTransaction(key, { chainId, nonce: count, maxPriorityFeePerGas: TIP, maxFeePerGas: BigInt(block.baseFeePerGas) * 2n + TIP, gas: estimate, to, value, data });
  }

  const wallet = {
    key,
    address,
    signMessage: (message) => personalSign(key, message),
    sign,
    broadcast: (raw) => rpc('eth_sendRawTransaction', [raw]),
    async send(tx) {
      return wallet.broadcast(await sign(tx));
    },
    transfer: (token, to, amount) => wallet.send({ to: token, data: calls.transfer(to, amount) }),
    sendEth: (to, wei) => wallet.send({ to, value: wei }),
  };
  return wallet;
}
