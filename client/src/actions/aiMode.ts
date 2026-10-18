import type State from '../types/State';

// How this person's built-in AI requests go right now. The server decides the same way: members
// with a voting key send anonymously while the workspace has that on, everyone else signed in.
export default function aiMode(s: Pick<State, 'aiAnonymous' | 'me'>) {
  if (!s.aiAnonymous) return { anonymous: false, why: 'This workspace has anonymous AI requests off.' };
  if (s.me?.role === 'guest') return { anonymous: false, why: 'Guests send AI requests signed in.' };
  if (!s.me?.semaphoreCommitment) return { anonymous: false, why: 'You haven’t set up anonymous requests yet.', setUp: true };
  return { anonymous: true, why: '' };
}
