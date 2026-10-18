import http from '../api/http';
import ApiError from '../api/ApiError';
import store from '../state/store';
import poolKey from '../state/poolKey';
import noteBook from '../lib/pools/noteBook';
import poolAccount from './poolAccount';
import type Task from '../types/Task';
import type Payment from '../types/Payment';
import type PaymentIntent from '../types/PaymentIntent';
import type PoolNote from '../types/PoolNote';
import type PoolQuote from '../types/PoolQuote';
import type PoolSets from '../types/PoolSets';

const kit = async () => (await import('../lib/pools/poolKit')).default;
const quote = (intentId: string) => http.post<{ quote: PoolQuote }>(`/pool-payouts/${intentId}/quote`).then((r) => r.quote);

export interface PreparedPayout {
  task: Task;
  intent: PaymentIntent;
  quote: PoolQuote;
  note: PoolNote;
  sets: PoolSets;
}

// The browser checks the relayer's terms itself: they must pay the one-time address it derived,
// and withdrawing `gross` must leave exactly the amount Nil asked for.
async function checkQuote(q: PoolQuote, to: string, amount: bigint) {
  const { relayTerms, grossAmount } = await kit();
  const terms = relayTerms(q.withdrawalData);
  if (terms.recipient !== to.toLowerCase() || terms.feeBps !== BigInt(q.feeBps)) throw new Error('The relayer’s terms don’t pay the contributor’s one-time address, so nothing was sent.');
  if (grossAmount(amount, terms.feeBps) !== BigInt(q.gross)) throw new Error('The relayer’s price doesn’t add up, so nothing was sent.');
}

// Paying a bounty from the team's pool, in two steps so the admin sees the fee first. Prepare
// works out a fresh one-time address for the contributor, starts the payment in Nil, gets the
// relayer's signed price and picks an approved deposit that covers it. Send proves the
// withdrawal here and hands it to the relayer, which sends it, so the team's wallet never
// touches the payout.
const poolPayout = {
  async prepare(task: Task): Promise<PreparedPayout> {
    const { users } = store.get();
    const payee = task.assigneeId ? users[task.assigneeId] : undefined;
    if (!payee?.stealthMeta) throw new Error('A payout from the pool goes to a one-time address, so the contributor needs private payouts on.');
    const book = poolAccount.book();
    if (!book) throw new Error('Open the team’s pool first.');
    const { default: newStealthPayment } = await import('../lib/stealth/newStealthPayment');
    const one = newStealthPayment(payee.stealthMeta);
    const { intent } = await http.post<{ intent: PaymentIntent }>(`/tasks/${task.id}/payments/intent`, { stealth: { ephemeralKey: one.ephemeralKey }, via: 'pool' });
    if (intent.to.toLowerCase() !== one.address.toLowerCase()) throw new Error('Nil asked to pay a different address than this browser expected, so nothing was sent.');
    const q = await quote(intent.id);
    await checkQuote(q, one.address, BigInt(intent.amount));
    const sets = await http.get<PoolSets>(`/pools/${intent.token}/sets`);
    const approved = new Set(sets.aspLeaves);
    const note = noteBook.pick(book, intent.token, BigInt(q.gross), (n) => Boolean(n.label && approved.has(n.label)));
    if (!note) throw new Error('No approved deposit in the pool covers this payout and its fee. Deposit more, or wait for the association set to approve a deposit.');
    return { task, intent, quote: q, note, sets };
  },

  async send(p: PreparedPayout, onStep: (step: string) => void = () => {}): Promise<Payment> {
    const key = poolKey.get();
    if (!key) throw new Error('Open the team’s pool first.');
    const { masterKeys, poolSecrets, noteSecrets, treeProof, withdrawalContext, proveWithdrawal } = await kit();
    const keys = masterKeys(key);
    const label = BigInt(p.note.label!);
    const value = BigInt(p.note.value);
    const existing = noteSecrets(keys, p.note);
    onStep('Checking the pool and the association set');
    const state = treeProof(p.sets.stateLeaves, poolSecrets.commitment(value, label, existing), p.sets.stateRoot, 'pool tree');
    const asp = treeProof(p.sets.aspLeaves, label, p.sets.aspRoot, 'association set');
    onStep('Proving the withdrawal in this browser');
    const context = withdrawalContext(p.quote.entrypoint, p.quote.withdrawalData, BigInt(p.quote.scope));
    const gross = BigInt(p.quote.gross);
    const proof = await proveWithdrawal({ value, label, existing, next: poolSecrets.withdrawal(keys, label, p.note.spends), withdrawn: gross, context, state, asp });

    // the relayer's signature lasts a minute; proving may take longer. Same terms, fresh signature.
    let terms = p.quote;
    if (terms.expiresAt - Date.now() < 15_000) {
      terms = await quote(p.intent.id);
      if (terms.withdrawalData !== p.quote.withdrawalData || terms.gross !== p.quote.gross) throw new Error('The relayer’s fee changed while the proof was made. Check the new fee and pay again.');
    }
    await poolAccount.update((book) => noteBook.pending(book, p.note, p.intent.id, gross));
    onStep('Handing it to the relayer');
    try {
      const { payment } = await http.post<{ payment: Payment }>(`/pool-payouts/${p.intent.id}/relay`, {
        withdrawal: { processooor: terms.entrypoint, data: terms.withdrawalData },
        proof: proof.proof,
        publicSignals: proof.publicSignals,
        feeCommitment: terms.feeCommitment,
      });
      await poolAccount.update((book) => noteBook.withdrew(book, p.note, { gross, intentId: p.intent.id, txHash: payment.txHash }));
      return payment;
    } catch (err) {
      // refused before the relayer saw it: nothing left the pool. Anything else stays pending
      // until a rebuild from the chain says what happened.
      if (err instanceof ApiError && err.status === 400) await poolAccount.update((book) => noteBook.release(book, p.note));
      throw err;
    }
  },
};

export default poolPayout;
