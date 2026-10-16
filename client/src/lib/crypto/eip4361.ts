import checksumAddress from './checksumAddress';

export interface Eip4361Fields {
  origin: string;
  address: string;
  statement: string;
  nonce: string;
  issuedAt: string;
  resources: string[];
}

// The Sign-In with Ethereum (EIP-4361) layout. Wallets recognise it, show the domain that asks,
// and warn when the page asking isn't that domain, which is what makes a phished key signature
// hard to collect. The chain is fixed at 1: key messages must read the same whichever network
// the wallet happens to be on, and the signature has nothing to do with any chain. Plain ASCII
// throughout, because some hardware wallets show anything else as hex.
export default function eip4361({ origin, address, statement, nonce, issuedAt, resources }: Eip4361Fields) {
  const url = new URL(origin);
  return [
    `${url.host} wants you to sign in with your Ethereum account:`,
    checksumAddress(address),
    '',
    statement,
    '',
    `URI: ${url.origin}`,
    'Version: 1',
    'Chain ID: 1',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    'Resources:',
    ...resources.map((r) => `- ${r}`),
  ].join('\n');
}
