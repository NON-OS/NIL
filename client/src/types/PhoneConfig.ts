// What a server with phone wallets on says about them at start-up (WALLETCONNECT_PROJECT_ID).
export default interface PhoneConfig {
  // public: every browser sends it to the relay
  projectId: string;
  // the WalletConnect relay, the one host besides the server the page may reach
  relayUrl: string;
  // the network the server works on, which the phone is asked to approve
  chainId: number;
}
