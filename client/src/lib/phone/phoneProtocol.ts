// What Nil asks of a phone wallet over WalletConnect: its own wallet calls and nothing else.
// The app reads nothing from the chain through a wallet and never signs typed data, so no read
// call and no eth_signTypedData_v4 ever goes over the relay.
const phoneProtocol = {
  // the id the phone wallet has among this browser's wallets
  walletId: 'walletconnect',
  // each one needs a tap on the phone
  remote: ['personal_sign', 'eth_sendTransaction', 'wallet_switchEthereumChain'],
  // answered here from what the phone approved when it connected
  local: ['eth_requestAccounts', 'eth_accounts', 'eth_chainId'],
  events: ['accountsChanged', 'chainChanged'],
  // WalletConnect turns down requests that expire sooner than five minutes, and the server's
  // sign-in message lasts five minutes too, so a phone gets that long to answer
  requestSeconds: 300,
  // how long a code stays good for: the five minutes a WalletConnect proposal lasts
  pairingSeconds: 300,
  // how long signing out waits for the relay to tell the phone, before forgetting anyway
  goodbyeMs: 3000,
};

export default phoneProtocol;
