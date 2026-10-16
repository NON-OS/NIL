import type Eip1193Provider from './Eip1193Provider';

// A wallet found in this browser. `id` is its EIP-6963 reverse-DNS name (io.rabby, io.metamask),
// or "injected" for an older wallet that only sets window.ethereum.
export default interface WalletOption {
  id: string;
  name: string;
  // a data: image from the wallet's own announcement, never a web address
  icon: string | null;
  provider: Eip1193Provider;
}
