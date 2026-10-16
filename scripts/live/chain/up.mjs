// Starts everything the live checks use and leaves it running for trying Nil by hand: an anvil
// fork of Ethereum mainnet, the same chain behind the public node's limits, wallets holding real
// NOX, USDC, staked NOX and Zero-State Passes, and Nil itself against that chain. Prints the
// address, the setup token and the wallets' keys (import one into a browser wallet pointed at
// the fork), and writes them to LIVE_CHAIN_OUT. Ctrl-C stops it all. See "Live chain checks"
// in docs/development.md.
//
//   ANVIL=/path/to/anvil node scripts/live/chain/up.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bytesToHex } from '@noble/hashes/utils';
import liveContext from './liveContext.mjs';
import SETUP_TOKEN from './setupToken.mjs';

const ctx = await liveContext();
const summary = {
  nil: ctx.nil.base,
  setupToken: SETUP_TOKEN,
  serverLog: ctx.nil.logFile,
  rpc: ctx.anvil.url,
  limitedRpc: ctx.proxy.url,
  chainId: ctx.chainId,
  treasury: { address: ctx.treasury.address, key: `0x${bytesToHex(ctx.treasury.key)}` },
  wallets: Object.fromEntries(Object.entries(ctx.wallets).map(([role, w]) => [role, { address: w.address, key: `0x${bytesToHex(w.key)}` }])),
};
const out = process.env.LIVE_CHAIN_OUT || path.join(os.tmpdir(), 'nil-live-chain.json');
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(`Nil:   ${summary.nil} (setup token ${SETUP_TOKEN})`);
console.log(`Chain: ${summary.rpc}, chain ID ${summary.chainId}; Nil uses ${summary.limitedRpc}`);
for (const [role, w] of Object.entries(summary.wallets)) console.log(`${role.padEnd(11)} ${w.address}  ${w.key}`);
console.log(`Written to ${out}. Ctrl-C stops everything.`);

const stop = () => ctx.stop().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
