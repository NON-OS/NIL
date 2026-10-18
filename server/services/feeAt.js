import noxTransferFee from '../chain/noxTransferFee.js';
import transferFee from './transferFee.js';
import usableFee from './usableFee.js';

// NOX's transfer fee in the block a payment was mined in, or the last one read when the node no
// longer keeps that block's state. Never more than governance can set.
export default async function feeAt(blockNumber) {
  try {
    return usableFee(await noxTransferFee(`0x${blockNumber.toString(16)}`));
  } catch {
    return transferFee.current().bps;
  }
}
