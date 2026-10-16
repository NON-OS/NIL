import http from '../api/http';
import store from '../state/store';
import records from '../state/records';
import type User from '../types/User';
import type PrivateKeys from '../types/PrivateKeys';

// Registers your anonymous voting key (the public Semaphore commitment), which joins you to every
// open anonymous vote and to new ones as they start. It happens when you unlock your keys or join
// a vote, never as part of casting: a key registered while signed in, followed a moment later by a
// ballot from the same browser, would point straight at you.
export default async function registerVotingKey(keys: PrivateKeys) {
  const me = store.get().me;
  if (!me || me.role === 'guest' || me.semaphoreCommitment) return;
  const { Identity } = await import('@semaphore-protocol/identity');
  const commitment = new Identity(keys.semaphoreSecret).commitment.toString();
  const { user } = await http.put<{ user: User }>('/me/semaphore', { commitment });
  const s = store.get();
  store.set({ me: { ...s.me!, ...user }, users: records.put(s.users, user) });
}
