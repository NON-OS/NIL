import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import rpc from './rpc.js';

let checked = false;

// Refuses to trust a node that sits on a different network than configured, so a testnet
// RPC can never "confirm" a mainnet payment or vouch for a mainnet balance.
export default async function nodeReady() {
  if (!config.nox.enabled) throw new HttpError(503, `${config.nox.symbol} features are turned off on this server.`);
  if (checked) return;
  const chainId = Number(await rpc('eth_chainId'));
  if (chainId !== config.nox.chainId) {
    throw new HttpError(502, `The Ethereum node is on chain ${chainId}, but this server expects chain ${config.nox.chainId}. Fix NOX_RPC_URL.`);
  }
  checked = true;
}
