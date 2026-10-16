import http from '../api/http';
import store from '../state/store';
import unlockPrivateKeys from './unlockPrivateKeys';
import registerVotingKey from './registerVotingKey';
import type Proposal from '../types/Proposal';

const loadIdentity = async () => {
  const [{ Identity }, keys] = await Promise.all([import('@semaphore-protocol/identity'), unlockPrivateKeys()]);
  return new Identity(keys.semaphoreSecret);
};

// a short random pause before sending, so a ballot doesn't arrive in lockstep with the page's
// other (signed-in) requests; the real protection is that it carries no cookie at all, and that
// the server holds it back and counts it with the rest of its hour
const jitter = () => new Promise((r) => setTimeout(r, 400 + Math.random() * 1600));

const anonymousVotes = {
  // Joining is its own step, well apart from voting: it registers your voting key, which puts
  // you in every open anonymous vote. Unlocking your keys for the first time does the same.
  async join() {
    await registerVotingKey(await unlockPrivateKeys());
  },

  // Whether your registered key holds a seat in this vote.
  joined(proposal: Proposal, key = store.get().me?.semaphoreCommitment) {
    return Boolean(key && proposal.anonymous?.members.some((m) => m.commitment === key && !m.removed));
  },

  // Your voting identity. It must already be registered: registering it now, seconds before the
  // ballot, would tie the two together.
  async identity() {
    const registered = store.get().me?.semaphoreCommitment;
    if (!registered) throw new Error('Join anonymous votes first, then vote.');
    const identity = await loadIdentity();
    if (identity.commitment.toString() !== registered) {
      throw new Error('This wallet unlocks a different voting key than the one you set up. Switch to the wallet you first voted with.');
    }
    return identity;
  },

  // Returns when the ballot joins the count: the end of the hour it arrived in.
  async cast(proposal: Proposal, choice: number) {
    if (!proposal.anonymous) throw new Error('This vote isn’t anonymous.');
    const identity = await anonymousVotes.identity();
    // prove against the latest member list, which may have grown since the page loaded
    const fresh = (await http.get<Proposal[]>('/proposals')).find((p) => p.id === proposal.id);
    if (!fresh?.anonymous) throw new Error('That vote is gone.');
    if (!anonymousVotes.joined(fresh)) throw new Error('You don’t have a seat in this vote.');
    const { default: proveBallot } = await import('../lib/semaphore/proveBallot');
    const proof = await proveBallot(identity, fresh.anonymous, choice);
    await jitter();
    const { countsAt } = await http.anonymous<{ countsAt: number }>('/anonymous-ballots/' + proposal.id, { proof });
    return countsAt;
  },

  // Whether one of the vote's counted ballots is yours, worked out locally from your key.
  async mine(proposal: Proposal) {
    if (!proposal.anonymous) return false;
    const [{ default: ballotNullifier }, identity] = await Promise.all([import('../lib/semaphore/ballotNullifier'), loadIdentity()]);
    return proposal.anonymous.nullifiers.includes(ballotNullifier(identity.secretScalar, proposal.anonymous.scope));
  },
};

export default anonymousVotes;
