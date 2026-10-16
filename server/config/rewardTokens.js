import configWarning from '../lib/configWarning.js';
import validAddress from '../lib/validAddress.js';
import chain from './chain.js';
import nox from './nox.js';
import ADDRESS_RULE from './addressRule.js';

// Tokens a team can pay bounties in, as SYMBOL:address:decimals pairs. NOX always comes first.
// The default is USDC on mainnet, so another chain needs its own list, or "none".
const DEFAULT_REWARDS = 'USDC:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48:6';

function rewardTokens(value) {
  const noxEntry = Object.freeze({ symbol: nox.symbol, address: nox.token, decimals: nox.decimals });
  if (value === 'none') return Object.freeze([noxEntry]);
  if (!value && chain.id !== 1) {
    if (nox.enabled) configWarning(`REWARD_TOKENS isn’t set, and its default is USDC on mainnet, but NOX_CHAIN_ID is ${chain.id}. Bounties are paid in ${nox.symbol} only until it lists this chain’s tokens (or says "none").`);
    return Object.freeze([noxEntry]);
  }
  const listed = (value || DEFAULT_REWARDS)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry, i) => {
      const [symbol, address, decimals, ...extra] = entry.split(':');
      const places = /^\d+$/.test(decimals ?? '') ? Number(decimals) : NaN;
      if (!symbol || extra.length || !validAddress(address) || !(places <= 77)) {
        configWarning(`REWARD_TOKENS entry ${i + 1} isn’t SYMBOL:address:decimals with a valid address (${ADDRESS_RULE}), so it’s left out.`);
        return [];
      }
      return [Object.freeze({ symbol: symbol.toUpperCase(), address: address.toLowerCase(), decimals: places })];
    });
  return Object.freeze([noxEntry, ...listed.filter((t) => t.symbol !== nox.symbol)]);
}

export default rewardTokens((process.env.REWARD_TOKENS ?? '').trim());
