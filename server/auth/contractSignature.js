import { bytesToHex } from '@noble/hashes/utils';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import rpc from '../chain/rpc.js';
import nodeReady from '../chain/nodeReady.js';
import abiWithBytes from '../chain/abiWithBytes.js';
import sigValidatorCode from '../chain/sigValidatorCode.js';

// isValidSignature(bytes32,bytes) has the selector 0x1626ba7e, and a wallet that accepts a
// signature returns those same four bytes, ABI-encoded as one word.
const IS_VALID_SIGNATURE = '1626ba7e';
const ACCEPTED = `0x${IS_VALID_SIGNATURE}${'0'.repeat(56)}`;
const COUNTERFACTUAL = '6492'.repeat(16);

// A reverted call is the wallet saying no. A node that doesn't answer in time is not.
async function call(params, block) {
  try {
    return String(await rpc('eth_call', [params, block], { timeoutMs: config.signIn.chainTimeoutMs })).toLowerCase();
  } catch (err) {
    if (err.refused) return null;
    throw new HttpError(503, 'This looks like a smart wallet, which Nil checks with the Ethereum network, and that check didn’t finish in time. Try again in a minute.');
  }
}

// Asks the chain whether a smart-contract wallet accepts `signature` over `digest`. Deployed
// wallets answer through EIP-1271. A wallet that so far exists only as a factory call (passkey
// wallets often stay that way until their first transaction) signs per EIP-6492, and the
// validator then deploys it inside one eth_call that changes nothing on-chain. With `block`
// (a number) the wallet is asked at that block instead of the latest one.
export default async function contractSignature(address, digest, signature, block = null) {
  const sig = signature.slice(2).toLowerCase();
  const hash = bytesToHex(digest);
  const tag = block === null ? 'latest' : `0x${block.toString(16)}`;
  await nodeReady();
  if (sig.endsWith(COUNTERFACTUAL)) {
    return (await call({ data: `0x${sigValidatorCode}${abiWithBytes([address, hash], sig)}` }, tag)) === '0x01';
  }
  // exact match only: a contract that echoes its calldata back would otherwise start with the selector too
  return (await call({ to: address, data: `0x${IS_VALID_SIGNATURE}${abiWithBytes([hash], sig)}` }, tag)) === ACCEPTED;
}
