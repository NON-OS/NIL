import crypto from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import personalHash from '../../auth/personalHash.js';

const word = (hex) => hex.replace(/^0x/, '').padStart(64, '0');
const bytes = (hex) => {
  const body = hex.replace(/^0x/, '');
  return word((body.length / 2).toString(16)) + body.padEnd(Math.ceil(body.length / 64) * 64, '0');
};
const COUNTERFACTUAL = '6492'.repeat(16);

// A throwaway smart-contract wallet for helpers/mockChain.js: one owner key signs, and the
// signature it hands out is longer than a plain one, as real smart wallets' are. A wallet that
// isn't deployed yet wraps its signature per EIP-6492 with the factory call that would create it.
export default function smartWallet({ deployed = true } = {}) {
  const key = secp256k1.utils.randomPrivateKey();
  const owner = `0x${bytesToHex(keccak_256(secp256k1.getPublicKey(key, false).slice(1)).slice(-20))}`;
  const address = `0x${crypto.randomBytes(20).toString('hex')}`;
  const factory = `0x${crypto.randomBytes(20).toString('hex')}`;
  // createAccount(owner, nonce) on the factory, or something shaped like it
  const factoryData = `0x3ffba36f${word(owner)}${word('0')}`;

  const ownerSignature = (message, signer = key) => {
    const sig = secp256k1.sign(personalHash(message), signer);
    return `00${bytesToHex(sig.toCompactRawBytes())}${(sig.recovery + 27).toString(16)}`;
  };
  const wrap = (inner, data = factoryData) => `0x${word(factory)}${word('60')}${word((96 + bytes(data).length / 2).toString(16))}${bytes(data)}${bytes(inner)}${COUNTERFACTUAL}`;

  const w = {
    address,
    owner,
    factory,
    factoryData,
    deployed,
    sign: (message) => (w.deployed ? `0x${ownerSignature(message)}` : wrap(ownerSignature(message))),
    // an EIP-6492 signature even once deployed, as wallets may keep sending them
    sign6492: (message, { factoryData: data } = {}) => wrap(ownerSignature(message), data),
    // the right shape, signed by a key that doesn't own the wallet
    forge: (message) => `0x${ownerSignature(message, secp256k1.utils.randomPrivateKey())}`,
  };
  return w;
}
