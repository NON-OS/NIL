import { spawn } from 'node:child_process';
import mainnet from './mainnet.mjs';
import rpcClient from './rpcClient.mjs';
import warmSystemContracts from './warmSystemContracts.mjs';

// Starts anvil as a fork of Ethereum mainnet at a recent finalized block, so the real NOX,
// staking, Zero-State Pass, USDC, announcer, price feed and smart-wallet factory are all there
// with their real state. The fork keeps chain ID 1 unless told otherwise, and names `safe` and
// `finalized` blocks 32 and 64 under the head like mainnet. ANVIL names the binary; npm has it
// as @foundry-rs/anvil.
export default async function startAnvil({ port = 8545, chainId = null, forkBlock = null, forkUrls = mainnet.forkUrls, slotsInAnEpoch = 32, state = null, log = null } = {}) {
  const block = forkBlock ?? Number(BigInt((await rpcClient(forkUrls[0])('eth_getBlockByNumber', ['finalized', false])).number));
  const args = [
    ...forkUrls.flatMap((u) => ['--fork-url', u]),
    '--fork-block-number', String(block),
    '--port', String(port),
    '--host', '127.0.0.1',
    '--slots-in-an-epoch', String(slotsInAnEpoch),
    '--retries', '8',
    '--fork-retry-backoff', '500',
    '--timeout', '30000',
    '--no-rate-limit',
    ...(chainId ? ['--chain-id', String(chainId)] : []),
    ...(state ? ['--state', state] : []),
  ];
  const child = spawn(process.env.ANVIL || 'anvil', args, { stdio: ['ignore', log ?? 'ignore', log ?? 'ignore'] });
  const url = `http://127.0.0.1:${port}`;
  const rpc = rpcClient(url);
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null) throw new Error(`anvil exited with code ${child.exitCode}`);
    let ready = false;
    try {
      await rpc('eth_chainId');
      ready = true;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
    if (ready) {
      await warmSystemContracts(url);
      return { url, rpc, forkBlock: block, process: child, stop: () => child.kill('SIGINT') };
    }
  }
  child.kill();
  throw new Error('anvil did not start within 30 seconds');
}
