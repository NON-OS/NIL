import HttpError from '../lib/HttpError.js';
import nox from '../lib/nox.js';
import holderGate from './holderGate.js';
import holderPower from './holderPower.js';
import holderWallets from './holderWallets.js';
import planGate from './planGate.js';
import seatGate from './seatGate.js';

// Whether a wallet may join through the holder door: the door is open, the plan and a free seat
// allow it, its holdings didn't let someone else in lately, and it holds enough. createAccount
// checks the first three again in the transaction that adds the person.
export default async function checkHolderJoin(address) {
  const gate = holderGate.get();
  if (!gate.enabled) throw HttpError.forbidden('This workspace is invite-only.');
  planGate('Joining as a holder');
  seatGate('member');
  holderWallets.checkFree(address);
  const held = (await holderPower([address])).total;
  if (held < BigInt(gate.minimum)) throw HttpError.forbidden(`This wallet holds ${nox(held)} counting NOX held, staked and Zero-State Passes. Joining without an invite needs at least ${nox(gate.minimum)}.`);
}
