import config from '../config.js';
import nodeReady from '../chain/nodeReady.js';
import transferFee from '../services/transferFee.js';

// At startup and every few minutes: whether NOX takes a fee on transfers between wallets.
export default async function checkTransferFee() {
  if (!config.nox.enabled) return;
  await nodeReady();
  await transferFee.refresh();
}
