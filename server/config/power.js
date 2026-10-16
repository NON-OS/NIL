import contract from './contract.js';

// Voting power: NOX in linked wallets, plus NOX staked in the official staking contract, plus a
// fixed amount of power per Zero-State Pass (ZSP). Admins can change the ZSP power per workspace;
// this is the default. "off" leaves a source out.
export default Object.freeze({
  staking: contract('NOX_STAKING', '0xa94d6009790Ba13597A1E1b7cF4e1531eA513613', { canBeOff: true, withoutIt: 'Staked NOX is left out of voting power until it’s set (or set to "off").' }),
  zsp: contract('ZSP_CONTRACT', '0x7b575dd8e8b111c52ab1e872924d4efd4df403df', { canBeOff: true, withoutIt: 'Zero-State Passes are left out of voting power until it’s set (or set to "off").' }),
  zspPower: /^\d+$/.test(process.env.VOTE_ZSP_POWER ?? '') ? process.env.VOTE_ZSP_POWER : '100000',
});
