import http from '../api/http';
import keyring from '../state/keyring';
import partialsMade from '../state/partialsMade';
import vault from './vault';
import anonymousVotes from './anonymousVotes';
import trusteeSeats from './trusteeSeats';
import trusteeSetup from './trusteeSetup';
import type Dealing from '../lib/ballot/dealing';
import type Proposal from '../types/Proposal';

const TELL = 'Tell your admin.';

const encryptedVotes = {
  ...trusteeSetup,
  seatOf: trusteeSeats.of,

  // What this trustee's browser has to do next for the key setup to move on, if anything.
  nextStep(proposal: Proposal): 'commit' | 'reveal' | 'check' | 'answer' | null {
    const enc = proposal.encrypted;
    const me = enc?.trustees.find((t) => t.position === trusteeSeats.of(proposal));
    if (!enc || !me || proposal.closedAt) return null;
    if (!me.committed) return 'commit';
    if (!me.dealt) return enc.trustees.every((t) => t.committed) ? 'reveal' : null;
    if (enc.complaints.some((c) => c.dealer === me.position && !c.outcome)) return 'answer';
    return enc.publicKey && !me.shares ? 'check' : null;
  },

  // Returns when the ballot joins the count, once the hour it arrived in is over.
  async cast(proposal: Proposal, choice: number) {
    const identity = await anonymousVotes.identity();
    const view = await anonymousVotes.fresh(proposal);
    const enc = view.encrypted;
    if (!enc?.publicKey) throw new Error('This vote isn’t open yet.');
    if (!enc.trustees.every((t) => t.shares === 'ok')) throw new Error('This vote opens once all three trustees have checked their key shares.');
    // encrypt to the key the trustees' signed dealings add up to, never to the server's say-so
    const [{ default: votePublicKey }, signers] = await Promise.all([import('../lib/ballot/votePublicKey'), trusteeSeats.signers(enc.trustees)]);
    const key = votePublicKey(view.id, enc.commitments, signers);
    if (!key || key[0] !== enc.publicKey[0] || key[1] !== enc.publicKey[1]) throw new Error(`The vote key the server sent isn’t the one the trustees signed for, so Nil won’t encrypt a ballot to it. ${TELL}`);
    const { default: proveEncryptedBallot } = await import('../lib/ballot/proveEncryptedBallot');
    const { proof, publicSignals } = await proveEncryptedBallot(identity, view, choice, key);
    return anonymousVotes.send(proposal.id, { proof, publicSignals });
  },

  // A trustee's partial decryption of the totals, proven correct, after the vote closes. This
  // browser checks every ballot and adds them up itself, and decrypts only those sums, once.
  async decrypt(proposal: Proposal) {
    const position = trusteeSeats.of(proposal);
    const enc = proposal.encrypted;
    if (!position || !enc?.dealings || !enc.aggregates || !enc.publicKey) throw new Error('There’s nothing for you to decrypt yet.');
    await vault.unlock();
    const [{ default: votePublicKey }, { default: verifyBallots }, { default: partialDecryption }, signers] = await Promise.all([
      import('../lib/ballot/votePublicKey'),
      import('../lib/ballot/verifyBallots'),
      import('../lib/ballot/partialDecryption'),
      trusteeSeats.signers(enc.trustees),
    ]);
    const key = votePublicKey(proposal.id, enc.commitments, signers);
    if (!key || key[0] !== enc.publicKey[0] || key[1] !== enc.publicKey[1]) throw new Error(`The vote key isn’t the one the trustees signed for, so Nil won’t decrypt anything. ${TELL}`);
    const { ballots, roots } = await http.get<{ ballots: { publicSignals: unknown; proof: unknown }[]; roots: string[] }>(`/proposals/${proposal.id}/ballots`);
    if (ballots.length !== proposal.voters) throw new Error(`The server sent a different number of ballots from the count it shows, so Nil won’t decrypt anything. ${TELL}`);
    const sums = await verifyBallots({ id: proposal.id, optionCount: proposal.options.length, publicKey: key, roots }, ballots, enc.aggregates);
    const digest = partialsMade.digest(sums);
    if (!partialsMade.allows(proposal.id, digest)) throw new Error(`You already decrypted your part of this vote, and the server now asks for other sums. Nil decrypts once per vote. ${TELL}`);
    partialsMade.record(proposal.id, digest);
    const partial = await partialDecryption(proposal.id, position, enc.dealings as Dealing[], sums, keyring.identity()!, { signers, answered: trusteeSeats.answered(enc, position) });
    await http.post(`/proposals/${proposal.id}/partial`, partial);
  },
};

export default encryptedVotes;
