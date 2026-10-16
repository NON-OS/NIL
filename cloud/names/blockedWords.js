// Nil sign-in is wallet based, so a workspace address that looks like a wallet vendor, an
// exchange or a giveaway is the obvious phishing setup. These words are refused anywhere in a
// name, after undoing common letter swaps (see nameCheck.js). The operator extends the list
// with CLOUD_BLOCKLIST_FILE.
const blockedWords = Object.freeze([
  'airdrop', 'binance', 'bitget', 'bybit', 'claimreward', 'coinbase', 'etherscan', 'freemint', 'giveaway', 'kraken',
  'ledgerlive', 'metamask', 'nonosfoundation', 'nonossupport', 'okx', 'opensea', 'phantomwallet', 'privatekey',
  'rabbywallet', 'recoveryphrase', 'safewallet', 'seedphrase', 'trezor', 'trustwallet', 'uniswap', 'walletconnect',
  'walletrecovery', 'walletsupport', 'walletverify',
]);

export default blockedWords;
