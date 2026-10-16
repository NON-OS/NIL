import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import siwe from './siwe.js';
import personalHash from './personalHash.js';
import contractSignature from './contractSignature.js';

// A smart wallet's signature can carry a factory call and passkey data, but never this much.
const MAX_SIGNATURE_BYTES = 16 * 1024;
const HEX = /^0x(?:[0-9a-fA-F]{2})+$/;
const PLAIN_LENGTH = 132;

const networkName = (chainId) => (chainId === 1 ? 'Ethereum mainnet' : `the network with chain ID ${chainId}`);

// Smart wallets sign for the network they're on, and Nil can only ask the one it's set up for.
function mismatch(message) {
  const signedOn = Number(/^Chain ID: (\d+)$/m.exec(message)?.[1]);
  const hint = signedOn && signedOn !== config.nox.chainId ? ` If you use a smart wallet, switch it to ${networkName(config.nox.chainId)} and try again.` : '';
  return new HttpError(401, `That signature doesn’t match the wallet.${hint}`);
}

// Checks that `address` (lowercase) signed `message`. A plain wallet's signature is checked
// here by recovering the signer, with no network call. Only when that fails is the chain asked
// whether the address is a smart-contract wallet that accepts the signature.
export default async function walletSignature(address, message, signature) {
  if (typeof signature !== 'string' || !HEX.test(signature) || signature.length > 2 + MAX_SIGNATURE_BYTES * 2) {
    throw new HttpError(401, 'That signature doesn’t match the wallet.');
  }
  if (siwe.recover(message, signature) === address) return;
  if (!config.nox.enabled) {
    // a plain signature from another key is simply wrong; anything longer comes from a smart wallet
    if (signature.length === PLAIN_LENGTH) throw mismatch(message);
    throw new HttpError(401, 'This looks like a smart wallet. This server isn’t connected to Ethereum, so it can’t check smart-wallet signatures. Sign in with a regular wallet, or ask your admin.');
  }
  if (!(await contractSignature(address, personalHash(message), signature))) throw mismatch(message);
}
