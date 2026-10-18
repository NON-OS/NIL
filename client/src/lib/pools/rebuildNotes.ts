import poolSecrets from './poolSecrets';
import type { MasterKeys } from './masterKeys';
import type PoolEvent from '../../types/PoolEvent';
import type PoolNote from '../../types/PoolNote';

// How many unused deposit indexes in a row end the search. Indexes are only skipped when a
// deposit failed before reaching the chain, which happens once or twice, not five times running.
const GAP = 5;

// The team's notes in one pool, worked out from the pool key and the pool's public events alone,
// for when the stored notes are lost or behind. Deposit n is the one whose precommitment matches
// the secrets for index n; each withdrawal is the one that spent the nullifier of what was left
// before it; a ragequit names the deposit's label.
export default function rebuildNotes(keys: MasterKeys, { symbol, scope }: { symbol: string; scope: string }, events: PoolEvent[]): PoolNote[] {
  const deposits = new Map(events.filter((e) => e.type === 'deposit').map((e) => [e.precommitment, e]));
  const withdrawals = new Map(events.filter((e) => e.type === 'withdrawal').map((e) => [e.nullifierHash, e]));
  const exits = new Set(events.filter((e) => e.type === 'ragequit').map((e) => e.label));
  const notes: PoolNote[] = [];
  for (let index = 0, misses = 0; misses < GAP; index++) {
    const found = deposits.get(poolSecrets.precommitment(poolSecrets.deposit(keys, BigInt(scope), index)).toString());
    if (!found?.label) {
      misses += 1;
      continue;
    }
    misses = 0;
    const label = BigInt(found.label);
    let value = BigInt(found.value);
    let spends = 0;
    const payouts: PoolNote['payouts'] = [];
    for (;;) {
      const secrets = spends === 0 ? poolSecrets.deposit(keys, BigInt(scope), index) : poolSecrets.withdrawal(keys, label, spends - 1);
      const spent = withdrawals.get(poolSecrets.nullifierHash(secrets).toString());
      if (!spent) break;
      value -= BigInt(spent.value);
      spends += 1;
      payouts.push({ intentId: '', txHash: spent.txHash, gross: spent.value, at: 0 });
    }
    const exited = exits.has(found.label);
    notes.push({
      symbol, scope, index, label: found.label, depositor: found.depositor ?? '', txHash: found.txHash, deposited: found.value,
      value: exited ? '0' : value.toString(), spends, state: exited ? 'exited' : value === 0n ? 'spent' : 'open', pending: null, payouts, createdAt: 0,
    });
  }
  return notes;
}
