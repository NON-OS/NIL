import config from '../config.js';
import readRegistryMeta from '../chain/readRegistryMeta.js';

const MAX_ENTRIES = 1000;
const cache = new Map();

// A wallet's meta-address from the ERC-6538 registry, kept for a few minutes so showing a pay
// button doesn't ask the node every time. `fresh` reads it now and keeps that, for someone
// checking what they just published. Failed reads aren't kept.
export default async function registryMeta(wallet, { fresh = false } = {}) {
  if (!config.stealth.registry) return { state: 'off' };
  const key = wallet.toLowerCase();
  const kept = cache.get(key);
  if (!fresh && kept && kept.until > Date.now()) return kept.answer;
  const answer = await readRegistryMeta(key);
  cache.delete(key);
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { answer, until: Date.now() + config.stealth.registryCacheMs });
  return answer;
}
