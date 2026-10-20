// Nil sign-in is wallet based, so a workspace address that looks like a wallet vendor, an
// exchange, a giveaway or NØNOS itself is the obvious phishing setup. These words are refused
// anywhere in a name, after undoing common letter swaps (see nameCheck.js), so "n0nos-team" and
// "nil-support" go the same way as "nonos". The operator extends the list with
// CLOUD_BLOCKLIST_FILE.
const blockedWords = Object.freeze([
  'admin', 'airdrop', 'binance', 'bitget', 'bybit', 'claimreward', 'coinbase', 'etherscan', 'freemint', 'giveaway',
  'kraken', 'ledgerlive', 'metamask', 'nonos', 'official', 'okx', 'opensea', 'phantomwallet', 'privatekey',
  'rabbywallet', 'recoveryphrase', 'safewallet', 'seedphrase', 'support', 'treasury', 'trezor', 'trustwallet', 'uniswap',
  'walletconnect', 'walletrecovery', 'walletsupport', 'walletverify',
]);

export default blockedWords;
