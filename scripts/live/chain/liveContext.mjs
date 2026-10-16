import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import startAnvil from './startAnvil.mjs';
import limitsProxy from './limitsProxy.mjs';
import rpcClient from './rpcClient.mjs';
import devChain from './devChain.mjs';
import testWallet from './testWallet.mjs';
import fundWallet from './fundWallet.mjs';
import stakeNox from './stakeNox.mjs';
import noxUsd from './noxUsd.mjs';
import bootNil from './bootNil.mjs';
import nilClient from './nilClient.mjs';
import mainnet from './mainnet.mjs';

const NOX = 10n ** 18n;
const USDC = 10n ** 6n;

// What each person starts with, in real tokens moved from real holders. Small enough that one
// fork serves several runs before the listed holders run dry.
const PEOPLE = {
  owner: { nox: 100_000n * NOX, usdc: 5_000n * USDC },
  member: {},
  payer: { nox: 60_000n * NOX, usdc: 5_000n * USDC },
  holder: { nox: 120_000n * NOX },
  staker: { nox: 60_000n * NOX, passes: 2 },
  smartOwner: {},
};

// Everything a live check needs: the chain (a fresh anvil fork, or the one at LIVE_CHAIN_RPC),
// the same chain behind the public node's limits, funded wallets, and Nil running against it.
export default async function liveContext({ nilEnv = {} } = {}) {
  const log = fs.openSync(path.join(os.tmpdir(), 'nil-live-anvil.log'), 'a');
  const anvil = process.env.LIVE_CHAIN_RPC ? { url: process.env.LIVE_CHAIN_RPC, rpc: rpcClient(process.env.LIVE_CHAIN_RPC), stop: () => {} } : await startAnvil({ port: Number(process.env.LIVE_CHAIN_PORT || 8545), log });
  const proxy = await limitsProxy({ upstream: anvil.url });
  const chain = devChain(anvil.rpc);
  const chainId = Number(BigInt(await anvil.rpc('eth_chainId')));

  const wallets = {};
  for (const [role, funds] of Object.entries(PEOPLE)) {
    wallets[role] = testWallet(anvil.rpc);
    await fundWallet(chain, wallets[role].address, { eth: 10n * NOX, ...funds });
  }
  await stakeNox(chain, wallets.staker, 50_000n * NOX);
  const treasury = testWallet(anvil.rpc);
  await chain.finalize();

  // NOX is priced from the real V2 pair over a short window, inside bounds around today's price.
  // The fork's Chainlink answer never updates, so its age limit is lifted.
  const spot = Number(await noxUsd(anvil.rpc));
  const nil = await bootNil({
    rpcUrl: proxy.url,
    env: {
      NOX_CHAIN_ID: String(chainId),
      PLAN_TREASURY: treasury.address,
      PLAN_TRIAL_DAYS: '0',
      PLAN_NOX_USD: spot.toPrecision(6),
      PLAN_NOX_POOL: mainnet.noxWethV2Pair,
      PLAN_TWAP_MINUTES: '5',
      PLAN_NOX_USD_MIN: (spot / 3).toPrecision(6),
      PLAN_NOX_USD_MAX: (spot * 3).toPrecision(6),
      PLAN_FEED_MAX_AGE_MINUTES: '1000000',
      JOB_POOL_PRICE_SECONDS: '3',
      ...nilEnv,
    },
  });
  return {
    anvil,
    proxy,
    chain,
    chainId,
    nil,
    wallets,
    treasury,
    spot,
    client: () => nilClient(nil.base, { chainId }),
    // Nil's own database, for the things a check can't wait days for: deadlines and grace periods.
    // Loaded only then, since node:sqlite still announces itself as experimental.
    db: async () => new (await import('node:sqlite')).DatabaseSync(path.join(nil.dataDir, 'nonos.db')),
    async stop() {
      await nil.stop();
      await proxy.close();
      anvil.stop();
    },
  };
}
