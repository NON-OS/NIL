import holderPower from './holderPower.js';
import holderWallets from './holderWallets.js';

// What counts toward the holder door across the wallets a person has linked, read at `block`
// (the latest by default). A wallet whose holdings counted for someone else lately is left out
// (see holderWallets), so the same tokens can't count for two people by moving between accounts.
// The wallets that did count are noted as counting for this person.
export default async function holdings(userId, { block = 'latest', now = Date.now() } = {}) {
  const wallets = holderWallets.eligible(userId, now);
  const power = await holderPower(wallets, block);
  holderWallets.record(userId, wallets.filter((_, i) => power.each[i] > 0n), now);
  return power;
}
