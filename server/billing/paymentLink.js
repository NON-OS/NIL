import config from '../config.js';

// An EIP-681 link a phone wallet opens as a ready-made token transfer: the exact amount, to the
// treasury, on the right chain. Shown as a QR code next to the invoice.
export default function paymentLink(token, amount) {
  return `ethereum:${token}@${config.nox.chainId}/transfer?address=${config.plan.treasury}&uint256=${amount}`;
}
