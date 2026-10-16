// The system contracts every new block writes to before its transactions run: EIP-2935 keeps
// the last 8191 block hashes, EIP-4788 the last 8191 beacon roots and their timestamps, each in a
// ring buffer. On a fork, anvil first fetches a slot's old value from the upstream node, so every
// mined block costs a remote call, and one failed call (a public node answering 502) crashes
// anvil. Filling the rings locally once means mining never needs the upstream for them. The
// values are zero instead of old hashes, which matters only to contracts that look those up.
const RINGS = [
  ['0x0000f90827f1c53a10cb7a02335b175320002935', 8191],
  ['0x000f3df6d732807ef1319fb7b8bb8522d0beac02', 2 * 8191],
];
const ZERO = `0x${'0'.repeat(64)}`;

export default async function warmSystemContracts(url) {
  for (const [address, slots] of RINGS) {
    for (let from = 0; from < slots; from += 1000) {
      const batch = [];
      for (let slot = from; slot < Math.min(slots, from + 1000); slot++) batch.push({ jsonrpc: '2.0', id: slot, method: 'anvil_setStorageAt', params: [address, `0x${slot.toString(16)}`, ZERO] });
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch) });
      const answers = await res.json();
      if (!Array.isArray(answers) || answers.some((a) => a.error)) throw new Error(`Couldn’t fill ${address}'s storage: ${JSON.stringify(answers).slice(0, 200)}`);
    }
  }
}
