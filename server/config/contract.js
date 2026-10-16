import configWarning from '../lib/configWarning.js';
import validAddress from '../lib/validAddress.js';
import chain from './chain.js';
import ADDRESS_RULE from './addressRule.js';

// A contract address. The defaults are Ethereum mainnet contracts, so on any other chain the
// operator has to name each contract, or "off" where a source can be left out. A value that
// isn't a valid address is reported and replaced by the default on mainnet. Elsewhere there is
// no default to fall back on, so the feature it serves stays off. Addresses aren't repeated in
// warnings: a private key pasted into the wrong line must not end up in the logs.
export default function contract(name, mainnet, { canBeOff = false, withoutIt }) {
  const value = (process.env[name] ?? '').trim();
  if (canBeOff && value === 'off') return null;
  if (validAddress(value)) return value.toLowerCase();
  if (value) configWarning(`${name} isn’t a valid Ethereum address (${ADDRESS_RULE}). ${chain.id === 1 ? `Using the default, ${mainnet}.` : withoutIt}`);
  if (chain.id === 1) return mainnet.toLowerCase();
  if (!value && !chain.off) configWarning(`${name} isn’t set, and its default is a mainnet contract, but NOX_CHAIN_ID is ${chain.id}. ${withoutIt}`);
  return null;
}
