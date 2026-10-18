import config from '../config.js';
import feeAt from '../services/feeAt.js';

// NOX's transfer fee as it was in each transfer's own block, read once per block for the length
// of one run. Other tokens keep no fee.
export default function blockFees() {
  const fees = new Map();
  return async (transfer) => {
    if (transfer.token !== config.nox.token) return 0;
    if (!fees.has(transfer.blockNumber)) fees.set(transfer.blockNumber, await feeAt(transfer.blockNumber));
    return fees.get(transfer.blockNumber);
  };
}
