import registryMeta from './registryMeta.js';

// The meta-address a private payout to this person is worked out from: the one they published
// in Nil, or else the one their wallet published in the ERC-6538 registry. The registry is how
// people who never turned private payouts on here, applicants from the public bounty board
// among them, can still be paid privately. `problem` says why there is none.
export default async function payeeMeta(payee) {
  if (payee.stealth_meta) return { metaAddress: payee.stealth_meta, source: 'nil', problem: null };
  if (!payee.address) return { metaAddress: null, source: null, problem: 'no-wallet' };
  const found = await registryMeta(payee.address);
  if (found.state === 'found') return { metaAddress: found.metaAddress, source: 'registry', problem: null };
  return { metaAddress: null, source: null, problem: found.state };
}
