import envNumber from '../lib/envNumber.js';
import configWarning from '../lib/configWarning.js';
import refuseToStart from '../lib/refuseToStart.js';
import appSite from './appSite.js';
import chain from './chain.js';
import contract from './contract.js';
import units from './units.js';
import PUBLIC_NODE from './publicNode.js';

const NOX_MAINNET = '0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca';

// The node sees every wallet and payout address this server looks up, and from which IP, so a
// public node could link them to your team. Only a local trial may fall back to one.
function rpcUrl(value, local) {
  if (value) return value;
  if (!local) {
    refuseToStart(
      'NOX_RPC_URL is required on a server people reach over the network. The Ethereum node sees every wallet and payout address Nil looks up, and this server’s IP address, so a public node could link them to your team. ' +
        'Run your own node (an execution client such as Geth, Nethermind or Reth, with a consensus client) and set NOX_RPC_URL to it, use a provider you trust, or set NOX_RPC_URL=off to turn on-chain features off.',
    );
  }
  configWarning(`NOX_RPC_URL isn’t set, so this local server uses the public node at ${PUBLIC_NODE}, which sees every address it looks up. Set your own node, or off, before others use this server.`);
  return PUBLIC_NODE;
}

// Explorer links open from the app, so only an http(s) address will do. The value isn't
// repeated in the warning, in case it carries an API key.
function explorer(value) {
  const fallback = 'https://etherscan.io';
  if (!value) return fallback;
  try {
    if (['http:', 'https:'].includes(new URL(value).protocol)) return value.replace(/\/+$/, '');
  } catch {}
  configWarning(`NOX_EXPLORER isn’t an http or https address. Using the default, ${fallback}.`);
  return fallback;
}

const env = process.env;
const token = contract('NOX_TOKEN', NOX_MAINNET, { withoutIt: 'On-chain features are off until it’s set.' });

export default Object.freeze({
  enabled: !chain.off && token !== null,
  rpcUrl: rpcUrl(env.NOX_RPC_URL, appSite.local),
  rpcTimeoutMs: envNumber('NOX_RPC_TIMEOUT_SECONDS', 10, { min: 1, max: 300 }) * units.SECOND,
  // the mainnet address stays in place when NOX is off for want of one, so nothing downstream sees null
  token: token ?? NOX_MAINNET,
  chainId: chain.id,
  symbol: env.NOX_SYMBOL || 'NOX',
  // token amounts fit in 256 bits, so more decimals than 77 can't mean anything
  decimals: envNumber('NOX_DECIMALS', 18, { max: 77 }),
  // how long a recorded payment may wait for its transaction to appear before it fails
  missingTxMs: envNumber('NOX_MISSING_TX_HOURS', 24, { min: 1 }) * units.HOUR,
  // how far under the head the node still answers eth_getLogs; the public node stops at 10,000
  logHistoryBlocks: envNumber('NOX_LOG_HISTORY_BLOCKS', 10_000, { min: 500 }),
  // the highest fee on transfers between wallets the token's governance can set, in basis points
  maxTransferFeeBps: envNumber('NOX_MAX_TRANSFER_FEE_BPS', 300, { max: 10_000 }),
  explorer: explorer(env.NOX_EXPLORER),
});
