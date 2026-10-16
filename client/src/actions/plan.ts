import http from '../api/http';
import store from '../state/store';
import ethereum from '../lib/ethereum';
import encodeTransfer from '../lib/encodeTransfer';
import type Plan from '../types/Plan';
import type Invoice from '../types/Invoice';
import type InvoiceAmount from '../types/InvoiceAmount';
import type Quote from '../types/Quote';
import type Revenue from '../types/Revenue';
import type InvoiceRequest from '../types/InvoiceRequest';

type Result = { invoice: Invoice; plan: Plan };
const settle = (r: Result) => {
  store.set({ plan: r.plan });
  return r.invoice;
};

const plan = {
  async invoices() {
    const r = await http.get<{ invoices: Invoice[]; credit: number; plan: Plan }>('/plan/invoices');
    store.set({ plan: r.plan });
    return r;
  },

  quote: (q: InvoiceRequest) => http.get<Quote>(`/plan/quote?${new URLSearchParams({ kind: q.kind, periods: String(q.periods), people: String(q.people) })}`),
  create: (q: InvoiceRequest) => http.post<Result>('/plan/invoices', q).then(settle),
  get: (id: string) => http.get<Result>(`/plan/invoices/${id}`).then(settle),
  check: (id: string) => http.post<Result>(`/plan/invoices/${id}/check`).then(settle),
  cancel: (id: string) => http.post<Result>(`/plan/invoices/${id}/cancel`).then(settle),
  retry: (id: string) => http.post<Result>(`/plan/invoices/${id}/retry`).then(settle),
  revenue: () => http.get<Revenue>('/plan/revenue'),

  // Tells the server which transaction pays the invoice, from a wallet here or pasted from an
  // exchange or a multisig. An exact payment would be found without it; naming it shows it at
  // once and lets an under- or overpayment be matched.
  name: (id: string, txHash: string) => http.post<Result>(`/plan/invoices/${id}/transactions`, { txHash }).then(settle),

  // The browser wallet sends exactly the asked amount of one token straight to the treasury.
  // Nothing is charged automatically and nothing renews by itself.
  async payWithWallet(invoice: Invoice, amount: InvoiceAmount) {
    const { nox, plan: current } = store.get();
    if (!nox || !current.treasury) throw new Error('This server doesn’t take Nil Pro payments.');
    const { address } = await ethereum.account();
    await ethereum.useChain(nox.chainId);
    const txHash = await ethereum.send({ from: address, to: amount.token, data: encodeTransfer(current.treasury, BigInt(amount.ask)) });
    try {
      return await plan.name(invoice.id, txHash);
    } catch {
      // the transfer went out; the treasury scan finds an exact amount without being told
      return invoice;
    }
  },
};

export default plan;
