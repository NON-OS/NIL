import configWarning from '../lib/configWarning.js';
import validAddress from '../lib/validAddress.js';
import chain from './chain.js';
import ADDRESS_RULE from './addressRule.js';

// A billing contract. Like the other contracts, a mainnet default applies only on mainnet;
// elsewhere it has to be named, and a server that charges is told when one is missing.
export default function envAddress(name, mainnet, withoutIt) {
  const raw = (process.env[name] ?? '').trim();
  if (raw === 'off') return null;
  if (validAddress(raw)) return raw.toLowerCase();
  const fallback = mainnet && chain.id === 1 ? mainnet.toLowerCase() : null;
  if (raw) configWarning(`${name} isn’t a valid Ethereum address (${ADDRESS_RULE}). ${fallback ? `Using the default, ${mainnet}.` : withoutIt}`);
  else if (mainnet && !fallback && (process.env.PLAN_TREASURY ?? '').trim() && !chain.off) configWarning(`${name} isn’t set, and its default is a mainnet contract, but NOX_CHAIN_ID is ${chain.id}. ${withoutIt}`);
  return fallback;
}
