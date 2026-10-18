import http from '../api/http';
import store from '../state/store';
import unlockPrivateKeys from './unlockPrivateKeys';
import registerVotingKey from './registerVotingKey';
import ballotPause from '../lib/semaphore/ballotPause';
import type Proposal from '../types/Proposal';
import type AnonymousVote from '../types/AnonymousVote';
import type AnonymousVoteView from '../types/AnonymousVoteView';

const loadIdentity = async () => {
  const [{ Identity }, keys] = await Promise.all([import('@semaphore-protocol/identity'), unlockPrivateKeys()]);
  return new Identity(keys.semaphoreSecret);
};

const anonymousVotes = {
  // Joining is its own step, well apart from voting: it registers your voting key, which puts
  // you in every open anonymous vote. Unlocking your keys for the first time does the same.
  async join() {
    await registerVotingKey(await unlockPrivateKeys());
  },

  // Whether your registered key holds a seat among these voters.
  joined(members: AnonymousVote['members'] | undefined, key = store.get().me?.semaphoreCommitment) {
    return Boolean(key && members?.some((m) => m.commitment === key && !m.removed));
  },

  // The vote as a ballot is proven from: fetched without the cookie, so the server can't tell
  // whose fetch it is, and checked against the voter list this browser was shown signed in.
  async fresh(proposal: Proposal) {
    const view = await http.anonymousGet<AnonymousVoteView>('/anonymous-votes/' + proposal.id);
    if (!view.open) throw new Error('This vote has closed.');
    if (!anonymousVotes.joined(view.members)) throw new Error('You don’t have a seat in this vote.');
    const { default: checkVoterList } = await import('../lib/semaphore/checkVoterList');
    checkVoterList(view, proposal.anonymous?.roots ?? [], proposal.weighting === 'power');
    return view;
  },

  // Sends a proven ballot without the cookie, after a random pause. Returns when it joins the count.
  async send(proposalId: string, body: unknown) {
    await ballotPause();
    const { countsAt } = await http.anonymous<{ countsAt: number }>('/anonymous-ballots/' + proposalId, body);
    return countsAt;
  },

  // Your voting identity. It must already be registered: registering it now, seconds before the
  // ballot, would tie the two together.
  async identity() {
    const registered = store.get().me?.semaphoreCommitment;
    if (!registered) throw new Error('Join anonymous votes first, then vote.');
    const identity = await loadIdentity();
    if (identity.commitment.toString() !== registered) {
      throw new Error('Your voting key changed when your keys were reset. Nil registers the new one by itself once the anonymous votes you joined with the old key have closed.');
    }
    return identity;
  },

  // Returns when the ballot joins the count, once the hour it was proven in is over.
  async cast(proposal: Proposal, choice: number) {
    if (!proposal.anonymous) throw new Error('This vote isn’t anonymous.');
    const identity = await anonymousVotes.identity();
    // prove against the latest member list, which may have grown since the page loaded
    const view = await anonymousVotes.fresh(proposal);
    const { default: proveBallot } = await import('../lib/semaphore/proveBallot');
    const proof = await proveBallot(identity, view, choice);
    return anonymousVotes.send(proposal.id, { proof });
  },

  // Whether one of the vote's counted ballots is yours, worked out locally from your key.
  async mine(proposal: Proposal) {
    if (!proposal.anonymous) return false;
    const [{ default: ballotNullifier }, identity] = await Promise.all([import('../lib/semaphore/ballotNullifier'), loadIdentity()]);
    return proposal.anonymous.nullifiers.includes(ballotNullifier(identity.secretScalar, proposal.anonymous.scope));
  },
};

export default anonymousVotes;
