// The hash of an Ethereum block chosen before the last contribution, used as the ceremony's
// final, public randomness. Nobody could know it when they contributed, and anyone can look it
// up afterwards. Refuses a block that isn't final yet.
export default async function beaconHash(rpc, number) {
  const call = (method, params) => fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((r) => r.json());
  const finalized = await call('eth_getBlockByNumber', ['finalized', false]);
  if (!finalized.result || Number(finalized.result.number) < number) throw new Error(`Block ${number} isn't final yet; the last final block is ${Number(finalized.result?.number ?? 0)}.`);
  const block = await call('eth_getBlockByNumber', [`0x${number.toString(16)}`, false]);
  if (!block.result?.hash) throw new Error(`Block ${number} couldn't be read from ${rpc}.`);
  return block.result.hash;
}
