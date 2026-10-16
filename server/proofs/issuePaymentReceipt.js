import config from '../config.js';
import rewardToken from '../lib/rewardToken.js';
import appendReceipt from './appendReceipt.js';
import titleCommit from './titleCommit.js';

// Signed statement that a bounty reached the contributor, with the transaction so anyone can
// check it on-chain. The receiving address is included because the transaction already
// shows it publicly; the task title stays hidden behind a commitment like work receipts.
export default function issuePaymentReceipt(payment, task) {
  const token = rewardToken(payment.token);
  const plain = task && !task.sealed;
  const hidden = plain ? titleCommit(task.title) : { salt: null, commit: null };
  return appendReceipt({
    type: 'nonos.payment',
    kind: 'payment',
    taskId: task?.id ?? null,
    userId: payment.payee_id,
    title: plain ? task.title : null,
    salt: hidden.salt,
    fields: {
      task: { ref: payment.task_ref, commit: hidden.commit },
      contributor: { id: payment.payee_id, wallet: payment.to_address },
      payment: { chainId: config.nox.chainId, token: token.address, symbol: token.symbol, decimals: token.decimals, amount: payment.amount, tx: payment.tx_hash },
      paidAt: new Date(payment.confirmed_at).toISOString(),
    },
  });
}
