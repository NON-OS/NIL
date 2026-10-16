// One token an invoice can be paid in. `ask` is what to send now: the full amount, or after a
// partial payment the exact top-up. `link` is the EIP-681 link for a phone wallet.
export default interface InvoiceAmount {
  token: string;
  symbol: string;
  decimals: number;
  amount: string;
  received: string;
  shortfall: string | null;
  ask: string;
  // USD per whole token, scaled by 10^18
  rate: string;
  rateSource: 'face' | 'oracle' | 'manual';
  link: string;
}
