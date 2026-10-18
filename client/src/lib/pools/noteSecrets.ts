import poolSecrets from './poolSecrets';
import type { MasterKeys } from './masterKeys';
import type PoolNote from '../../types/PoolNote';

// The secrets of a note's current commitment: the deposit's own until the first withdrawal,
// then those of what the last withdrawal left.
export default function noteSecrets(keys: MasterKeys, note: PoolNote) {
  if (note.spends === 0) return poolSecrets.deposit(keys, BigInt(note.scope), note.index);
  if (!note.label) throw new Error('That deposit has no label yet.');
  return poolSecrets.withdrawal(keys, BigInt(note.label), note.spends - 1);
}
