import log from '../lib/log.js';
import noxTransferFee from '../chain/noxTransferFee.js';

let state = { bps: 0, checkedAt: null };

// NOX's fee on transfers between wallets, as last read from the token. NOX's governance can turn
// one on (up to 3%); then every exact amount Nil asks for arrives short by it. Admins are told,
// and a payment short by exactly that fee still counts.
const transferFee = {
  current: () => state,

  async refresh(now = Date.now()) {
    const bps = await noxTransferFee();
    if (bps !== state.bps) {
      if (bps > 0) log.warn('nox', `NOX now takes a ${bps / 100}% fee on transfers between wallets. Exact-amount payments arrive that much short; Nil still recognises them by that fee.`);
      else if (state.checkedAt) log.info('nox', 'NOX no longer takes a fee on transfers between wallets.');
    }
    state = { bps, checkedAt: now };
    return state;
  },
};

export default transferFee;
