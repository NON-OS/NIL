// Well-known wallets to start with. People open these links themselves, in a new tab; Nil never
// loads anything from these sites. `openIn` builds the wallet's documented link for opening a
// page inside its app's own browser, where Nil can then talk to the wallet. The page link goes
// along as it is: invite and reset links have already travelled through whatever app brought
// them here, and each one works once.
interface WalletApp {
  name: string;
  site: string;
  openIn: ((url: string) => string) | null;
}

const walletApps: WalletApp[] = [
  // https://docs.metamask.io/sdk/guides/use-deeplinks: the page address without its scheme
  { name: 'MetaMask', site: 'https://metamask.io/', openIn: (url) => `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, '')}` },
  // Coinbase Wallet's "deep link into dapp browser": the page address, percent-encoded
  { name: 'Coinbase Wallet', site: 'https://www.coinbase.com/wallet', openIn: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
  // Rainbow's universal links route /dapp?url= to its in-app browser
  { name: 'Rainbow', site: 'https://rainbow.me/', openIn: (url) => `https://rnbwapp.com/dapp?url=${encodeURIComponent(url)}` },
  // https://developer.trustwallet.com/developer/develop-for-trust/deeplinking: open_url, coin 60 is Ethereum
  { name: 'Trust Wallet', site: 'https://trustwallet.com/', openIn: (url) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}` },
  { name: 'Rabby', site: 'https://rabby.io/', openIn: null },
];

export default walletApps;
