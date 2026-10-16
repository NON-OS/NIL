const hex = (n) => `0x${BigInt(n).toString(16)}`;

// Controls for the local node that a real chain doesn't have: mining on demand, snapshots to
// stage a reorganisation, and sending as a real holder without their key. Anvil names the
// finalized block 2 × slotsInAnEpoch under the head, like mainnet does with 32-slot epochs.
export default function devChain(rpc, { slotsInAnEpoch = 32 } = {}) {
  const chain = {
    rpc,
    head: async () => Number(BigInt(await rpc('eth_blockNumber'))),
    // the mainnet block the fork started from; everything after it happened locally
    forkBlock: async () => (await rpc('anvil_nodeInfo')).forkConfig.forkBlockNumber,
    finalized: async () => Number(BigInt((await rpc('eth_getBlockByNumber', ['finalized', false])).number)),
    // `interval` seconds between the blocks' timestamps, for checks that need chain time to pass
    mine: (blocks = 1, interval = null) => rpc('anvil_mine', interval ? [hex(blocks), hex(interval)] : [hex(blocks)]),
    // Block times follow the real clock on mainnet. A snapshot revert winds anvil's clock back,
    // which would make a payment look earlier than it was, so the next block catches up.
    async syncClock() {
      const latest = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
      const now = Math.floor(Date.now() / 1000);
      if (now > latest) await rpc('evm_setNextBlockTimestamp', [now]);
    },
    // enough empty blocks that everything mined so far is final
    async finalize() {
      await chain.syncClock();
      return chain.mine(2 * slotsInAnEpoch + 1);
    },
    snapshot: () => rpc('evm_snapshot'),
    revert: (id) => rpc('evm_revert', [id]),
    automine: (on) => rpc('evm_setAutomine', [on]),
    setBalance: (address, wei) => rpc('anvil_setBalance', [address, hex(wei)]),
    // a fork asks its upstream about hashes it hasn't mined, and public upstreams time out now
    // and then, so a failed lookup is just another try
    async receipt(hash, { tries = 100 } = {}) {
      for (let i = 0; i < tries; i++) {
        const found = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`No receipt for ${hash}`);
    },
    // A transaction from a real address, without its key; it still runs the real contract code.
    // The gas is set rather than estimated: anvil's estimate for a forked contract that loads
    // its state lazily can come out short.
    async as(from, tx) {
      await rpc('anvil_impersonateAccount', [from]);
      try {
        return await rpc('eth_sendTransaction', [{ from, gas: hex(3_000_000), ...tx, value: hex(tx.value ?? 0) }]);
      } finally {
        await rpc('anvil_stopImpersonatingAccount', [from]);
      }
    },
  };
  return chain;
}
