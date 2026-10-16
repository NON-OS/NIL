import http from '../api/http';
import store from '../state/store';
import ethereum from '../lib/ethereum';
import encodeTransfer from '../lib/encodeTransfer';
import payerWallet from '../lib/payerWallet';
import type Plan from '../types/Plan';
import type PlanPayment from '../types/PlanPayment';

type Result = { payment: PlanPayment; plan: Plan };
const settle = (r: Result) => {
  store.set({ plan: r.plan });
  return r.payment;
};

const plan = {
  payments: () => http.get<PlanPayment[]>('/plan/payments'),

  // Your own wallet sends NOX straight to the treasury; the server then reads the transfer
  // on-chain before it counts. Nothing is charged automatically and nothing renews by itself.
  async pay(periods: number) {
    const { nox, plan: current } = store.get();
    if (!nox || !current.treasury || !current.price) throw new Error('This server doesn’t take subscription payments.');
    const from = await payerWallet(nox.chainId);
    const txHash = await ethereum.send({ from, to: nox.token, data: encodeTransfer(current.treasury, BigInt(current.price) * BigInt(periods)) });
    return plan.record(txHash);
  },

  // For payments sent another way, like from a Safe multisig.
  record: (txHash: string) => http.post<Result>('/plan/payments', { txHash }).then(settle),
  check: (id: string) => http.post<Result>(`/plan/payments/${id}/check`).then(settle),
};

export default plan;
