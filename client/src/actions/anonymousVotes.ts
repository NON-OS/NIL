import http from '../api/http';
import store from '../state/store';
import records from '../state/records';
import unlockPrivateKeys from './unlockPrivateKeys';
import type User from '../types/User';
import type Proposal from '../types/Proposal';

const loadIdentity = async () => {
  const [{ Identity }, keys] = await Promise.all([import('@semaphore-protocol/identity'), unlockPrivateKeys()]);
  return new Identity(keys.semaphoreSecret);
};

// a short random pause before sending, so a ballot doesn't arrive in lockstep with the page's
// other (signed-in) requests; the real protection is that it carries no cookie at all
const jitter = () => new Promise((r) => setTimeout(r, 400 + Math.random() * 1600));

const anonymousVotes = {
  // Registers your voting key (the Semaphore commitment) if it isn't yet, or again after a key
  // reset gave you a new one; the server refuses the switch while an anonymous vote is open.
  async ensureKey() {
    const identity = await loadIdentity();
    const commitment = identity.commitment.toString();
    const me = store.get().me!;
    if (me.semaphoreCommitment !== commitment) {
      const { user } = await http.put<{ user: User }>('/me/semaphore', { commitment });
      const s = store.get();
      store.set({ me: { ...s.me!, ...user }, users: records.put(s.users, user) });
    }
    return identity;
  },

  async cast(proposal: Proposal, choice: number) {
    if (!proposal.anonymous) throw new Error('This vote isn’t anonymous.');
    const identity = await anonymousVotes.ensureKey();
    // the member list may have just changed (we joined it); prove against the latest
    const fresh = (await http.get<Proposal[]>('/proposals')).find((p) => p.id === proposal.id);
    if (!fresh?.anonymous) throw new Error('That vote is gone.');
    const { default: proveBallot } = await import('../lib/semaphore/proveBallot');
    const proof = await proveBallot(identity, fresh.anonymous, choice);
    await jitter();
    await http.anonymous('/anonymous-ballots/' + proposal.id, { proof });
    return proof.nullifier;
  },

  // Whether one of the vote's ballots is yours, worked out locally from your key.
  async mine(proposal: Proposal) {
    if (!proposal.anonymous) return false;
    const [{ default: ballotNullifier }, identity] = await Promise.all([import('../lib/semaphore/ballotNullifier'), loadIdentity()]);
    return proposal.anonymous.nullifiers.includes(ballotNullifier(identity.secretScalar, proposal.anonymous.scope));
  },
};

export default anonymousVotes;
