import http from '../api/http';
import store from '../state/store';
import putTask from '../state/putTask';
import toast from '../state/toast';
import payerWallet from '../lib/payerWallet';
import ethereum from '../lib/ethereum';
import encodeTransfer from '../lib/encodeTransfer';
import announceCall from '../lib/stealth/announceCall';
import type Task from '../types/Task';
import type Payment from '../types/Payment';
import type PaymentIntent from '../types/PaymentIntent';
import type BountyOverview from '../types/BountyOverview';

const BOUNTY_STATE: Record<Payment['state'], Task['bountyState']> = { sent: 'pending', confirming: 'pending', paid: 'paid', overpaid: 'paid', underpaid: 'underpaid', failed: null, cancelled: null };

// a private payout names its one-time address and the ephemeral key's public half, never the
// ephemeral private key
const start = (taskId: string, stealth?: { address: string; ephemeralPublicKey: string; viewTag: number }) => http.post<{ intent: PaymentIntent }>(`/tasks/${taskId}/payments/intent`, stealth ? { stealth } : {}).then((r) => r.intent);

async function recorded(taskId: string, intentId: string, txHash: string, announceTx?: string) {
  const { payment } = await http.post<{ payment: Payment }>(`/tasks/${taskId}/payments`, { intentId, txHash, announceTx });
  const task = store.get().tasks[taskId];
  if (task) putTask({ ...task, bountyState: BOUNTY_STATE[payment.state] });
  return payment;
}

// The server names the address to pay; this browser already knows it, and refuses to send
// anywhere else, so a server that was tampered with can't redirect a payout.
function sameAddress(expected: string, intent: PaymentIntent) {
  if (intent.to.toLowerCase() !== expected.toLowerCase()) throw new Error('Nil asked to send to a different address than this browser expected, so nothing was sent.');
}

const announced = (id: string, txHash: string) => http.post<{ payment: Payment }>(`/payments/${id}/announce`, { txHash }).then((r) => r.payment);

const bounties = {
  overview: () => http.get<BountyOverview>('/bounties'),

  // The payer's own wallet sends the reward token straight to the contributor. Nil first says
  // exactly how much (what's still owed, ending in a few digits that identify this payment),
  // then checks the result on-chain; it never touches the funds. When the contributor has
  // private payouts on, the tokens go to a fresh one-time address only they can open,
  // announced on-chain so they can find it without Nil.
  async pay(task: Task) {
    const { nox, users, rewards, stealth } = store.get();
    const token = rewards.find((t) => t.symbol === task.bountyToken);
    const payee = task.assigneeId ? users[task.assigneeId] : undefined;
    if (!nox || !task.bounty || !token) throw new Error('This task has no bounty this server can pay.');
    if (!payee?.address) throw new Error('The assignee has no wallet linked yet.');
    const from = await payerWallet(nox.chainId);

    if (!payee.stealthMeta || !stealth) {
      const intent = await start(task.id);
      sameAddress(payee.address, intent);
      return recorded(task.id, intent.id, await ethereum.send({ from, to: token.address, data: encodeTransfer(intent.to, BigInt(intent.amount)) }));
    }

    // the curve maths for one-time addresses loads only for a private payout
    const { default: newStealthPayment } = await import('../lib/stealth/newStealthPayment');
    const one = newStealthPayment(payee.stealthMeta);
    const intent = await start(task.id, one);
    sameAddress(one.address, intent);
    const amount = BigInt(intent.amount);
    const transfer = { to: token.address, data: encodeTransfer(one.address, amount) };
    const announce = { to: stealth.announcer, data: announceCall({ stealthAddress: one.address, ephemeralPublicKey: one.ephemeralPublicKey, viewTag: one.viewTag, token: token.address, amount }) };
    const topUp = BigInt(stealth.gasTopUpWei) > 0n ? [{ to: one.address, data: '0x', value: BigInt(stealth.gasTopUpWei) }] : [];

    const bundle = await ethereum.batch(from, nox.chainId, [transfer, announce, ...topUp]);
    if (bundle) return recorded(task.id, intent.id, bundle, bundle);

    // one prompt at a time: the payout is recorded the moment it's sent, so declining a later
    // prompt never loses track of it
    let payment = await recorded(task.id, intent.id, await ethereum.send({ from, ...transfer }));
    try {
      payment = await announced(payment.id, await ethereum.send({ from, ...announce }));
    } catch {
      toast.show('The payout went out but isn’t announced yet. Announce it from the Payments list on Bounties.', { tone: 'error', timeout: 8000 });
      return payment;
    }
    if (topUp.length) {
      await ethereum.send({ from, ...topUp[0] }).catch(() => toast.show('Skipped the gas top-up. The contributor needs a little ETH at that address to move the tokens.', { timeout: 8000 }));
    }
    return payment;
  },

  // Announces a private payout that went out without one, from the data the server kept.
  async announce(payment: Payment) {
    const { nox, rewards, stealth } = store.get();
    const token = rewards.find((t) => t.symbol === payment.token);
    if (!nox || !stealth || !token || !payment.ephemeralPublicKey || payment.viewTag === null) throw new Error('This payout can’t be announced from here.');
    const from = await payerWallet(nox.chainId);
    const data = announceCall({ stealthAddress: payment.to, ephemeralPublicKey: payment.ephemeralPublicKey, viewTag: payment.viewTag, token: token.address, amount: BigInt(payment.amount) });
    return announced(payment.id, await ethereum.send({ from, to: stealth.announcer, data }));
  },

  // For payments sent some other way, like from a Safe multisig: first the exact amount to
  // send, then the transaction that sent it.
  start: (taskId: string) => start(taskId),
  record: (taskId: string, intentId: string, txHash: string) => recorded(taskId, intentId, txHash),
  check: (id: string) => http.post<{ payment: Payment }>(`/payments/${id}/check`).then((r) => r.payment),
  cancel: (id: string) => http.post<{ payment: Payment }>(`/payments/${id}/cancel`).then((r) => r.payment),
  dismiss: (id: string) => http.del(`/payments/${id}`),
  setTreasury: (addresses: string[]) => http.put<{ treasury: string[] }>('/bounties/treasury', { addresses }).then((r) => r.treasury),
};

export default bounties;
