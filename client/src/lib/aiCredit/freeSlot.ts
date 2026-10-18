import ballotNullifier from '../semaphore/ballotNullifier';
import creditScope from './creditScope';

// A random slot of today's that this identity hasn't spent, or null when all are gone. Spent
// ones are found by working out this identity's nullifier for each slot and looking for it
// among today's spent nullifiers; random order means a slot number says nothing about how many
// requests someone already made today.
export default function freeSlot(secretScalar: bigint, workspaceKey: string, day: string, slots: number, spent: string[]) {
  const used = new Set(spent);
  const free = Array.from({ length: slots }, (_, slot) => slot).filter((slot) => !used.has(ballotNullifier(secretScalar, creditScope(workspaceKey, day, slot))));
  if (!free.length) return null;
  const pick = new Uint32Array(1);
  crypto.getRandomValues(pick);
  return free[pick[0] % free.length];
}
