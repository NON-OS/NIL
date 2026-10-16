import http from '../api/http';
import store from '../state/store';
import keyring from '../state/keyring';
import vault from './vault';
import anonymousVotes from './anonymousVotes';
import keyDirectory from './keyDirectory';
import confirmKeys from './confirmKeys';
import type Dealing from '../lib/ballot/dealing';
import type Proposal from '../types/Proposal';

const seatOf = (proposal: Proposal) => proposal.encrypted?.trustees.find((t) => t.userId === store.get().me?.id)?.position ?? null;
const trusteeIds = (proposal: Proposal) => proposal.encrypted!.trustees.map((t) => t.userId).filter((id): id is string => Boolean(id));

// a short random pause before sending, like plain anonymous ballots, so a ballot doesn't arrive in lockstep with signed-in requests
const jitter = () => new Promise((r) => setTimeout(r, 400 + Math.random() * 1600));

async function seed() {
  await vault.unlock();
  return keyring.identity()!.seed;
}

const encryptedVotes = {
  seatOf,

  // What this trustee's browser has to do next for the key setup to move on, if anything.
  nextStep(proposal: Proposal): 'commit' | 'reveal' | 'check' | null {
    const enc = proposal.encrypted;
    const me = enc?.trustees.find((t) => t.position === seatOf(proposal));
    if (!enc || !me || proposal.closedAt) return null;
    if (!me.committed) return 'commit';
    if (!me.dealt) return enc.trustees.every((t) => t.committed) ? 'reveal' : null;
    return enc.publicKey && !me.shares ? 'check' : null;
  },

  // Step 1: commit to a dealing before seeing anyone else's. The line comes from this trustee's
  // identity, so the reveal rebuilds the same one, even after a reload. Every trustee's key is
  // confirmed first, since the shares will be sealed to them.
  async commit(proposal: Proposal) {
    const position = seatOf(proposal);
    if (!position) throw new Error('You’re not a trustee of this vote.');
    await confirmKeys.ask(trusteeIds(proposal), 'your trustee share');
    const { default: commitDealing } = await import('../lib/ballot/commitDealing');
    await http.put(`/proposals/${proposal.id}/commitment`, { commitment: commitDealing(await seed(), proposal.id, position) });
  },

  // Step 2, once all three have committed: the dealing itself, with the shares sealed to each
  // trustee's confirmed key.
  async reveal(proposal: Proposal) {
    const position = seatOf(proposal);
    if (!position) throw new Error('You’re not a trustee of this vote.');
    await confirmKeys.ask(trusteeIds(proposal), 'your trustee share');
    const keys = await keyDirectory.sharable(trusteeIds(proposal));
    const recipients = proposal.encrypted!.trustees.map((t) => {
      const publicKey = t.userId ? keys.get(t.userId) : undefined;
      if (!publicKey) throw new Error('A trustee’s key isn’t confirmed or no longer exists, so this vote can’t be set up. Confirm it in Settings, under Security, or ask the admin to start the vote again.');
      return { position: t.position, publicKey };
    });
    const [{ default: dealingLine }, { default: dealShares }] = await Promise.all([import('../lib/ballot/dealingLine'), import('../lib/ballot/dealShares')]);
    await http.put(`/proposals/${proposal.id}/dealing`, await dealShares(proposal.id, position, dealingLine(await seed(), proposal.id, position), recipients));
  },

  // Step 3, as soon as the key is set up: open the shares sealed to this trustee and check them
  // against the dealers' commitments, before anyone votes.
  async checkShares(proposal: Proposal) {
    const position = seatOf(proposal);
    const dealings = proposal.encrypted?.dealings;
    if (!position || !dealings?.every(Boolean)) throw new Error('The dealings aren’t all in yet.');
    await vault.unlock();
    const { default: checkShares } = await import('../lib/ballot/checkShares');
    const result = await checkShares(proposal.id, position, dealings as Dealing[], keyring.identity()!);
    await http.post(`/proposals/${proposal.id}/shares-check`, result.ok ? { ok: true } : { ok: false, from: result.from });
    if (!result.ok) throw new Error(`Trustee ${result.from}’s share doesn’t match what they committed to. The vote won’t take ballots; ask an admin to start it again.`);
  },

  async cast(proposal: Proposal, choice: number) {
    const identity = await anonymousVotes.ensureKey();
    const fresh = (await http.get<Proposal[]>('/proposals')).find((p) => p.id === proposal.id);
    const enc = fresh?.encrypted;
    if (!fresh || !enc?.publicKey) throw new Error('This vote isn’t open yet.');
    if (enc.disputed) throw new Error('A trustee found a bad key share, so this vote can’t take ballots.');
    // encrypt to the key the trustees' commitments add up to, never to the server's say-so
    const { default: votePublicKey } = await import('../lib/ballot/votePublicKey');
    const key = votePublicKey(fresh.id, enc.commitments);
    if (!key || key[0] !== enc.publicKey[0] || key[1] !== enc.publicKey[1]) throw new Error('The vote key the server sent doesn’t match the trustees’ commitments, so Nil won’t encrypt a ballot to it. Tell your admin.');
    const { default: proveEncryptedBallot } = await import('../lib/ballot/proveEncryptedBallot');
    const { proof, publicSignals } = await proveEncryptedBallot(identity, fresh, choice, key);
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
    const partial = await partialDecryption(proposal.id, position, enc.dealings as Dealing[], enc.aggregates, keyring.identity()!);
    await http.post(`/proposals/${proposal.id}/partial`, partial);
  },
};

export default encryptedVotes;
