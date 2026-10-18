import config from '../config.js';

// A NOX transfer fee Nil will match payments by. Governance can set at most
// NOX_MAX_TRANSFER_FEE_BPS (3% for NOX); a reading above that is a misread or a changed token,
// so it counts as no fee at all rather than letting a transfer short by it pass as paid in full.
export default function usableFee(bps) {
  return bps > config.nox.maxTransferFeeBps ? 0 : bps;
}
