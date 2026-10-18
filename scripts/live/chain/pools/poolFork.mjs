import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Group } from '@semaphore-protocol/group';
import startAnvil from '../startAnvil.mjs';
import limitsProxy from '../limitsProxy.mjs';
import devChain from '../devChain.mjs';
import testWallet from '../testWallet.mjs';
import fundWallet from '../fundWallet.mjs';
import bootNil from '../bootNil.mjs';
import calls from '../calls.mjs';
import forkPoolServices from './forkPoolServices.mjs';
import poolAbi from '../../../../server/pools/poolAbi.js';

const ETH = 10n ** 18n;
const ENTRYPOINT = '0x6818809eefce719e480a7526d76bd3e561526b46';
const USDC_POOL = '0xb419c2867ab3cbc78921660cb95150d95a94ce86';
// sends every association root update to the mainnet entry contract (read from its RootUpdated events)
const POSTMAN = '0x1f4fe25cf802a0605229e0dc497aaf653e86e187';
const word = (n) => BigInt(n).toString(16).padStart(64, '0');

function updateRoot(root, cid) {
  const bytes = Buffer.from(cid).toString('hex');
  return `0x${calls.selector('updateRoot(uint256,string)')}${word(root)}${word(0x40)}${word(cid.length)}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, '0')}`;
}

// A mainnet fork with 0xbow's real Privacy Pools contracts, Nil running against it with pool
// payouts on, an admin and a contributor wallet, and stand-ins for the relayer and the
// association set provider. `approve` does what 0xbow's provider would: it puts a new
// association root holding the given label on-chain, sent as the real postman.
export default async function poolFork({ usdc = 100n * 10n ** 6n } = {}) {
  const anvil = await startAnvil({ port: Number(process.env.LIVE_CHAIN_PORT || 8546), log: fs.openSync(path.join(os.tmpdir(), 'nil-live-pools-anvil.log'), 'a') });
  const proxy = await limitsProxy({ upstream: anvil.url });
  const chain = devChain(anvil.rpc);
  const [owner, member, relayer] = [testWallet(anvil.rpc), testWallet(anvil.rpc), testWallet(anvil.rpc)];
  await fundWallet(chain, owner.address, { eth: 2n * ETH, usdc });
  await fundWallet(chain, member.address, { eth: ETH / 10n });
  await fundWallet(chain, relayer.address, { eth: 2n * ETH });
  await chain.setBalance(POSTMAN, ETH);
  // leaves inserted on the fork itself, read from the local node as a real provider indexes them
  const newLeaves = async () => {
    const logs = await anvil.rpc('eth_getLogs', [{ address: USDC_POOL, topics: [poolAbi.leafInserted], fromBlock: `0x${(anvil.forkBlock + 1).toString(16)}`, toBlock: 'latest' }]);
    return logs.map((l) => BigInt(`0x${l.data.slice(66, 130)}`).toString());
  };
  const services = await forkPoolServices({ relayer, entrypoint: ENTRYPOINT, newLeaves });
  const nil = await bootNil({ rpcUrl: proxy.url, env: { NOX_CHAIN_ID: '1', PRIVACY_POOLS: 'on', PRIVACY_POOLS_RELAYER_URL: services.url, PRIVACY_POOLS_ASP_URL: services.url, PRIVACY_POOLS_SETS_CACHE_SECONDS: '5' } });

  // 0xbow's own snapshot of the USDC pool, trimmed to the tree as it stood at the fork
  const scope = BigInt(await anvil.rpc('eth_call', [{ to: USDC_POOL, data: `0x${poolAbi.scope}` }, 'latest']));
  const size = Number(BigInt(await anvil.rpc('eth_call', [{ to: USDC_POOL, data: `0x${calls.selector('currentTreeSize()')}` }, 'latest'])));
  const real = await fetch('https://api.0xbow.io/1/public/mt-leaves', { headers: { 'X-Pool-Scope': scope.toString() } }).then((r) => r.json()).catch(() => null);
  services.state.stateLeaves = (real?.stateTreeLeaves ?? []).slice(0, size);
  const realLabels = real?.aspLeaves ?? [];

  return {
    anvil, proxy, chain, nil, services, owner, member, relayer, size,
    entrypoint: ENTRYPOINT,
    pool: USDC_POOL,
    async approve(label) {
      const approved = [...new Set([...realLabels, label])];
      const root = new Group(approved.map(BigInt)).root;
      const sent = await chain.receipt(await chain.as(POSTMAN, { to: ENTRYPOINT, data: updateRoot(root, `bafkreinilprivacypoolslivecheck${'x'.repeat(28)}`) }));
      if (sent.status !== '0x1') throw new Error('the postman could not update the association root');
      services.state.aspLeaves = approved.map(String);
      return approved.length;
    },
    async stop() {
      await nil.stop();
      await proxy.close();
      services.close();
      anvil.stop();
    },
  };
}
