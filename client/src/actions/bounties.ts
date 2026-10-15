import http from '../api/http';
import store from '../state/store';
import putTask from '../state/putTask';
import identity from './identity';
import ethereum from '../lib/ethereum';
import encodeTransfer from '../lib/encodeTransfer';
import type Task from '../types/Task';
import type Payment from '../types/Payment';
import type BountyOverview from '../types/BountyOverview';

async function recorded(taskId: string, txHash: string) {
  const { payment } = await http.post<{ payment: Payment }>(`/tasks/${taskId}/payments`, { txHash });
  const task = store.get().tasks[taskId];
  if (task) putTask({ ...task, bountyState: payment.status === 'failed' ? null : payment.status === 'confirmed' ? 'paid' : 'pending' });
  return payment;
}

const bounties = {
  overview: () => http.get<BountyOverview>('/bounties'),

  // The payer's own wallet sends the reward token straight to the contributor. NØNOS only
  // builds the transfer and afterwards checks the result on-chain; it never touches the funds.
  async pay(task: Task) {
    const { nox, users, rewards } = store.get();
    const token = rewards.find((t) => t.symbol === task.bountyToken);
    const payee = task.assigneeId ? users[task.assigneeId] : undefined;
    if (!nox || !task.bounty || !token) throw new Error('This task has no bounty this server can pay.');
    if (!payee?.address) throw new Error('The assignee has no wallet linked yet.');

    const [{ address }, mine, overview] = await Promise.all([ethereum.account(), identity.overview(), bounties.overview()]);
    const allowed = new Set([...mine.credentials.map((c) => c.address.toLowerCase()), ...overview.treasury]);
    if (!allowed.has(address.toLowerCase())) {
      throw new Error('Your wallet is on an account that isn’t linked to NØNOS. Switch accounts, or link this wallet under Settings → Security first.');
    }
    await ethereum.useChain(nox.chainId);
    const txHash = await ethereum.send({ from: address, to: token.address, data: encodeTransfer(payee.address, BigInt(task.bounty)) });
    return recorded(task.id, txHash);
  },

  // For payments sent some other way, like from a Safe multisig.
  record: recorded,
  check: (id: string) => http.post<{ payment: Payment }>(`/payments/${id}/check`).then((r) => r.payment),
  dismiss: (id: string) => http.del(`/payments/${id}`),
  setTreasury: (addresses: string[]) => http.put<{ treasury: string[] }>('/bounties/treasury', { addresses }).then((r) => r.treasury),
};

export default bounties;
