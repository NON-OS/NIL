import http from '../api/http';
import store from '../state/store';
import vault from './vault';
import keyring from '../state/keyring';
import anonymousVotes from './anonymousVotes';
import b64u from '../lib/crypto/b64u';
import type Proposal from '../types/Proposal';

const seatOf = (proposal: Proposal) => proposal.encrypted?.trustees.find((t) => t.userId === store.get().me?.id)?.position ?? null;

// a short random pause before sending, like plain anonymous ballots, so a ballot doesn't arrive in lockstep with signed-in requests
const jitter = () => new Promise((r) => setTimeout(r, 400 + Math.random() * 1600));

const encryptedVotes = {
  seatOf,

  // A trustee deals their share of the vote key, sealed to each trustee's encryption key. The
  // random line behind the dealing is never kept, so nobody can rebuild the whole key.
  async deal(proposal: Proposal) {
    const position = seatOf(proposal);
    if (!position) throw new Error('You’re not a trustee of this vote.');
    const keys = await http.get<{ userId: string; publicKey: string }[]>('/encryption-keys');
    const recipients = proposal.encrypted!.trustees.map((t) => {
      const key = keys.find((k) => k.userId === t.userId)?.publicKey;
      if (!key) throw new Error('A trustee no longer has an encryption key, so this vote can’t be set up. Ask the admin to start it again.');
      return { position: t.position, publicKey: b64u.decode(key) };
    });
    const { default: dealShares } = await import('../lib/ballot/dealShares');
    await http.put(`/proposals/${proposal.id}/dealing`, await dealShares(proposal.id, position, recipients));
  },

  async cast(proposal: Proposal, choice: number) {
    const identity = await anonymousVotes.ensureKey();
    const fresh = (await http.get<Proposal[]>('/proposals')).find((p) => p.id === proposal.id);
    if (!fresh?.encrypted?.publicKey) throw new Error('This vote isn’t open yet.');
    const { default: proveEncryptedBallot } = await import('../lib/ballot/proveEncryptedBallot');
    const { proof, publicSignals } = await proveEncryptedBallot(identity, fresh, choice);
    await jitter();
    await http.anonymous('/anonymous-ballots/' + proposal.id, { proof, publicSignals });
  },

  // A trustee's partial decryption of the totals, proven correct, after the vote closes.
  async decrypt(proposal: Proposal) {
    const position = seatOf(proposal);
    const enc = proposal.encrypted;
    if (!position || !enc?.dealings || !enc.aggregates) throw new Error('There’s nothing for you to decrypt yet.');
    await vault.unlock();
    const { default: partialDecryption } = await import('../lib/ballot/partialDecryption');
    const partial = await partialDecryption(proposal.id, position, enc.dealings.map((d) => d!), enc.aggregates, keyring.identity()!);
    await http.post(`/proposals/${proposal.id}/partial`, partial);
  },
};

export default encryptedVotes;
