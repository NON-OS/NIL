import type PoolBook from '../../types/PoolBook';
import type PoolNote from '../../types/PoolNote';

const same = (a: PoolNote, b: { scope: string; index: number }) => a.scope === b.scope && a.index === b.index;
const RANK: Record<PoolNote['state'], number> = { sending: 0, failed: 1, open: 2, spent: 3, exited: 4 };

function update(book: PoolBook, at: { scope: string; index: number }, change: (n: PoolNote) => PoolNote): PoolBook {
  if (!book.notes.some((n) => same(n, at))) throw new Error('That deposit isn’t in the team’s pool notes.');
  return { ...book, notes: book.notes.map((n) => (same(n, at) ? change(n) : n)) };
}

// The team's deposits and what's left of each, kept as plain data so every change is a new
// book: saved encrypted, merged when two admins change it at once, and rebuilt from the chain
// when needed. Amounts are decimal strings of the token's smallest unit.
const noteBook = {
  empty: (): PoolBook => ({ v: 1, notes: [] }),

  // Each deposit uses the next index in its pool, even after a failed one, so no two deposits
  // ever share secrets.
  nextIndex: (book: PoolBook, scope: string) => Math.max(-1, ...book.notes.filter((n) => n.scope === scope).map((n) => n.index)) + 1,

  // A deposit about to be sent, written down first so a closed tab can't leave it unrecorded.
  reserve(book: PoolBook, { symbol, scope, depositor, amount }: { symbol: string; scope: string; depositor: string; amount: bigint }) {
    const note: PoolNote = { symbol, scope, index: noteBook.nextIndex(book, scope), label: null, depositor: depositor.toLowerCase(), txHash: null, deposited: amount.toString(), value: '0', spends: 0, state: 'sending', pending: null, payouts: [], createdAt: Date.now() };
    return { book: { ...book, notes: [...book.notes, note] }, note };
  },

  sent: (book: PoolBook, at: PoolNote, txHash: string) => update(book, at, (n) => ({ ...n, txHash: txHash.toLowerCase() })),

  // The pool credited it: the label it gave and the value after the vetting fee.
  mined: (book: PoolBook, at: PoolNote, { label, value }: { label: string; value: string }) => update(book, at, (n) => ({ ...n, label, deposited: value, value, state: 'open' })),

  failed: (book: PoolBook, at: PoolNote) => update(book, at, (n) => (n.state === 'sending' ? { ...n, state: 'failed' } : n)),

  // A withdrawal the relayer sent: what's left moves to the next set of secrets.
  withdrew(book: PoolBook, at: PoolNote, { gross, intentId, txHash }: { gross: bigint; intentId: string; txHash: string | null }) {
    return update(book, at, (n) => {
      const left = BigInt(n.value) - gross;
      if (left < 0n || n.state !== 'open') throw new Error('That deposit doesn’t hold enough for this payout.');
      return { ...n, value: left.toString(), spends: n.spends + 1, state: left === 0n ? 'spent' : 'open', pending: null, payouts: [...n.payouts, { intentId, txHash, gross: gross.toString(), at: Date.now() }] };
    });
  },

  // Handed to the relayer, outcome unknown: the note waits until a rebuild from the chain says.
  pending: (book: PoolBook, at: PoolNote, intentId: string, gross: bigint) => update(book, at, (n) => ({ ...n, pending: { intentId, gross: gross.toString(), at: Date.now() } })),

  // The relayer was never handed it after all.
  release: (book: PoolBook, at: PoolNote) => update(book, at, (n) => ({ ...n, pending: null })),

  exited: (book: PoolBook, at: PoolNote) => update(book, at, (n) => ({ ...n, value: '0', state: 'exited', pending: null })),

  // What the team holds per token, all of it and the part the association set lets out privately.
  balances(book: PoolBook, approved: (n: PoolNote) => boolean) {
    const out = new Map<string, { total: bigint; usable: bigint }>();
    for (const n of book.notes.filter((x) => x.state === 'open')) {
      const b = out.get(n.symbol) ?? { total: 0n, usable: 0n };
      b.total += BigInt(n.value);
      if (approved(n) && !n.pending) b.usable += BigInt(n.value);
      out.set(n.symbol, b);
    }
    return out;
  },

  // A withdrawal spends one deposit at a time. The smallest one that covers it keeps the larger
  // ones whole for later payouts.
  pick(book: PoolBook, symbol: string, gross: bigint, approved: (n: PoolNote) => boolean) {
    return book.notes
      .filter((n) => n.symbol === symbol && n.state === 'open' && !n.pending && approved(n) && BigInt(n.value) >= gross)
      .sort((a, b) => (BigInt(a.value) < BigInt(b.value) ? -1 : BigInt(a.value) > BigInt(b.value) ? 1 : 0))[0] ?? null;
  },

  // What a rebuild from the chain found replaces what the book says about those deposits, since
  // the chain is the truth; the book keeps which payout each withdrawal was. A deposit the book
  // was still sending that the chain doesn't have never landed.
  adopt(book: PoolBook, scope: string, found: PoolNote[]): PoolBook {
    const kept = book.notes.map((n) => {
      const chain = found.find((f) => same(f, n));
      if (chain) return { ...chain, createdAt: n.createdAt, payouts: n.payouts.length === chain.payouts.length ? n.payouts : chain.payouts };
      return n.scope === scope && n.state === 'sending' ? { ...n, state: 'failed' as const } : n;
    });
    return { v: 1, notes: [...kept, ...found.filter((f) => !book.notes.some((n) => same(n, f)))] };
  },

  // Two admins saved different books from the same start: keep every deposit either knows, and
  // for one both know, the one further along. Spends only ever move forward.
  merge(mine: PoolBook, theirs: PoolBook): PoolBook {
    const out = [...theirs.notes];
    for (const n of mine.notes) {
      const i = out.findIndex((o) => same(o, n));
      if (i < 0) out.push(n);
      else if (n.spends > out[i].spends || (n.spends === out[i].spends && RANK[n.state] > RANK[out[i].state])) out[i] = n;
    }
    return { v: 1, notes: out.sort((a, b) => a.createdAt - b.createdAt) };
  },
};

export default noteBook;
