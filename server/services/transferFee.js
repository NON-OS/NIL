import config from '../config.js';
import log from '../lib/log.js';
import noxTransferFee from '../chain/noxTransferFee.js';
import usableFee from './usableFee.js';

let state = { bps: 0, read: 0, checkedAt: null };

// NOX's fee on transfers between wallets, as last read from the token. NOX's governance can turn
// one on (up to 3%); then every exact amount Nil asks for arrives short by it. Admins are told,
// and a payment short by exactly that fee still counts when the token is seen keeping it. A
// reading above what governance can set is reported to the operator and treated as no fee.
const transferFee = {
  current: () => state,

  async refresh(now = Date.now()) {
    const read = await noxTransferFee();
    const bps = usableFee(read);
    if (read !== bps && read !== state.read) {
      log.warn('nox', `NOX reports a ${read / 100}% fee on transfers between wallets, more than the ${config.nox.maxTransferFeeBps / 100}% its governance can set (NOX_MAX_TRANSFER_FEE_BPS). Nil takes it for a misread and counts no payment as short by a fee until the reading makes sense again.`);
    } else if (bps !== state.bps) {
      if (bps > 0) log.warn('nox', `NOX now takes a ${bps / 100}% fee on transfers between wallets. Exact-amount payments arrive that much short; Nil still recognises them by that fee.`);
      else if (state.checkedAt) log.info('nox', 'NOX no longer takes a fee on transfers between wallets.');
    }
    state = { bps, read, checkedAt: now };
    return state;
  },
};

export default transferFee;
