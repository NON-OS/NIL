// Two things WalletConnect's client does besides passing encrypted messages, both off here, as in
// the web app (client/src/lib/phone/hardenClient.ts):
// - Verify: before each proposal and request it loads verify.walletconnect.org in a hidden
//   frame, so the wallet can be told which site asked. The page's policy refuses frames anyway;
//   this also skips the seconds spent waiting for one.
// - Next to each encrypted request it tells the relay, in the clear, the method, the network and
//   the contract called. Only the request's id goes now.
// Both are fields of the pinned version; if an upgrade renames them, this refuses to run rather
// than leak quietly.
export default function hardenClient(client) {
  const verify = client.core.verify;
  const engine = client.engine;
  if (typeof verify.register !== 'function' || typeof engine.getTVFParams !== 'function') {
    throw new Error('This WalletConnect version works differently, so phone wallets stay off until the sign-up page is updated.');
  }
  verify.register = async () => '';
  engine.getTVFParams = () => ({});
}
