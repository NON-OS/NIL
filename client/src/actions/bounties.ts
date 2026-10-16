import http from '../api/http';
import store from '../state/store';
import putTask from '../state/putTask';
import toast from '../state/toast';
import payerWallet from '../lib/payerWallet';
import ethereum from '../lib/ethereum';
import encodeTransfer from '../lib/encodeTransfer';
import newStealthPayment from '../lib/stealth/newStealthPayment';
import announceCall from '../lib/stealth/announceCall';
import type Task from '../types/Task';
import type Payment from '../types/Payment';
import type BountyOverview from '../types/BountyOverview';

type Stealth = { ephemeralKey: string; announceTx?: string };

async function recorded(taskId: string, txHash: string, stealth?: Stealth) {
  const { payment } = await http.post<{ payment: Payment }>(`/tasks/${taskId}/payments`, { txHash, stealth });
  const task = store.get().tasks[taskId];
  if (task) putTask({ ...task, bountyState: payment.status === 'failed' ? null : payment.status === 'confirmed' ? 'paid' : 'pending' });
  return payment;
}

const announced = (id: string, txHash: string) => http.post<{ payment: Payment }>(`/payments/${id}/announce`, { txHash }).then((r) => r.payment);

const bounties = {
  overview: () => http.get<BountyOverview>('/bounties'),

  // The payer's own wallet sends the reward token straight to the contributor. Nil only
  // builds the transfer and afterwards checks the result on-chain; it never touches the funds.
  // When the contributor has private payouts on, the tokens go to a fresh one-time address
  // only they can open, announced on-chain so they can find it without Nil.
  async pay(task: Task) {
    const { nox, users, rewards, stealth } = store.get();
    const token = rewards.find((t) => t.symbol === task.bountyToken);
    const payee = task.assigneeId ? users[task.assigneeId] : undefined;
    if (!nox || !task.bounty || !token) throw new Error('This task has no bounty this server can pay.');
    if (!payee?.address) throw new Error('The assignee has no wallet linked yet.');
    const from = await payerWallet(nox.chainId);
    const amount = BigInt(task.bounty);

    if (!payee.stealthMeta || !stealth) {
      return recorded(task.id, await ethereum.send({ from, to: token.address, data: encodeTransfer(payee.address, amount) }));
    }

    const one = newStealthPayment(payee.stealthMeta);
    const transfer = { to: token.address, data: encodeTransfer(one.address, amount) };
    const announce = { to: stealth.announcer, data: announceCall({ stealthAddress: one.address, ephemeralPublicKey: one.ephemeralPublicKey, viewTag: one.viewTag, token: token.address, amount }) };
    const topUp = BigInt(stealth.gasTopUpWei) > 0n ? [{ to: one.address, data: '0x', value: BigInt(stealth.gasTopUpWei) }] : [];

    const bundle = await ethereum.batch(from, nox.chainId, [transfer, announce, ...topUp]);
    if (bundle) return recorded(task.id, bundle, { ephemeralKey: one.ephemeralKey, announceTx: bundle });

    // one prompt at a time: the payout is recorded the moment it's sent, so declining a later
    // prompt never loses track of it
    let payment = await recorded(task.id, await ethereum.send({ from, ...transfer }), { ephemeralKey: one.ephemeralKey });
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

  // For payments sent some other way, like from a Safe multisig.
  record: (taskId: string, txHash: string) => recorded(taskId, txHash),
  check: (id: string) => http.post<{ payment: Payment }>(`/payments/${id}/check`).then((r) => r.payment),
  dismiss: (id: string) => http.del(`/payments/${id}`),
  setTreasury: (addresses: string[]) => http.put<{ treasury: string[] }>('/bounties/treasury', { addresses }).then((r) => r.treasury),
};

export default bounties;
