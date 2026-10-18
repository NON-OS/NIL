import poolAbi from '../../pools/poolAbi.js';
import selector from '../../chain/selector.js';

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (hex) => String(hex).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const word = (n) => pad(BigInt(n).toString(16));

// Fake Privacy Pools contracts on the mock chain: what the entry contract and one pool answer,
// and the logs a relayed withdrawal leaves behind, built the way the real contracts emit them.
export default function poolChain(chain, { entrypoint, pool, token, scope = 777n, minimum = 1_000_000n, vettingBps = 50n, maxRelayBps = 1000n }) {
  const set = (to, sig, value) => chain.answer(to, `0x${sig}`, value);
  chain.answer(entrypoint, `0x${poolAbi.assetConfig}${pad(token)}`, `0x${pad(pool)}${word(minimum)}${word(vettingBps)}${word(maxRelayBps)}`);
  set(pool, poolAbi.scope, `0x${word(scope)}`);
  set(pool, poolAbi.asset, `0x${pad(token)}`);
  set(pool, poolAbi.entrypoint, `0x${pad(entrypoint)}`);
  set(pool, poolAbi.dead, `0x${word(0)}`);
  return {
    scope,
    // the roots the chain holds now, for poolSets
    roots({ aspRoot, stateRoot, size }) {
      set(entrypoint, poolAbi.latestRoot, `0x${word(aspRoot)}`);
      set(pool, poolAbi.currentRoot, `0x${word(stateRoot)}`);
      set(pool, selector('currentTreeSize()'), `0x${word(size)}`);
    },
    // The logs of entrypoint.relay(): the pool's Withdrawn to the entry contract, the pool's
    // transfer to it, its transfers to the recipient and the fee recipient, then WithdrawalRelayed.
    // `override` swaps parts out to build the forgeries tests need.
    relayLogs({ to, gross, fee, feeRecipient = '0x00000000000000000000000000000000000fee00', override = {} }) {
      const o = { pool, entrypoint, token, net: gross - fee, ...override };
      return [
        { address: o.pool, topics: [poolAbi.withdrawn, `0x${pad(o.entrypoint)}`], data: `0x${word(gross)}${word(123n)}${word(456n)}` },
        { address: token, topics: [TRANSFER, `0x${pad(o.pool)}`, `0x${pad(o.entrypoint)}`], data: `0x${word(gross)}` },
        { address: o.token, topics: [TRANSFER, `0x${pad(o.entrypoint)}`, `0x${pad(to)}`], data: `0x${word(o.net)}` },
        { address: token, topics: [TRANSFER, `0x${pad(o.entrypoint)}`, `0x${pad(feeRecipient)}`], data: `0x${word(fee)}` },
        { address: o.entrypoint, topics: [poolAbi.relayed, `0x${pad('0x00000000000000000000000000000000000000aa')}`, `0x${pad(o.recipient ?? to)}`, `0x${pad(token)}`], data: `0x${word(gross)}${word(fee)}` },
      ];
    },
  };
}
