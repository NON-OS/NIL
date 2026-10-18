import http from '../api/http';
import store from '../state/store';
import keyring from '../state/keyring';
import vault from './vault';
import keyDirectory from './keyDirectory';
import confirmKeys from './confirmKeys';
import trusteeSeats from './trusteeSeats';
import type Dealing from '../lib/ballot/dealing';
import type Proposal from '../types/Proposal';

async function unlocked() {
  await vault.unlock();
  return { ...keyring.identity()!, userId: store.get().me!.id };
}

function seat(proposal: Proposal) {
  const position = trusteeSeats.of(proposal);
  if (!position) throw new Error('You’re not a trustee of this vote.');
  return position;
}

// A trustee's part in setting up an encrypted vote's key. Everything a trustee sends is signed
// with their own signing key, so the server can't deal a seat itself or speak for a trustee.
const trusteeSetup = {
  // Step 1: commit to a dealing before seeing anyone else's. The line comes from this trustee's
  // identity, so the reveal rebuilds the same one, even after a reload. Every trustee's key is
  // confirmed first, since the shares will be sealed to them.
  async commit(proposal: Proposal) {
    const position = seat(proposal);
    await confirmKeys.ask(trusteeSeats.ids(proposal), 'your trustee share');
    const [{ default: commitDealing }, { default: trusteeStatement }, { default: trusteeSignature }] = await Promise.all([import('../lib/ballot/commitDealing'), import('../lib/ballot/trusteeStatement'), import('../lib/ballot/trusteeSignature')]);
    const me = await unlocked();
    const commitment = commitDealing(me.seed, proposal.id, position);
    const signature = trusteeSignature.sign(trusteeStatement.commit(proposal.id, position, me.userId, commitment), me.signingPrivate);
    await http.put(`/proposals/${proposal.id}/commitment`, { commitment, signature });
  },

  // Step 2, once all three have committed: the dealing itself, with the shares sealed to each
  // trustee's confirmed key, signed together with the commitments.
  async reveal(proposal: Proposal) {
    const position = seat(proposal);
    await confirmKeys.ask(trusteeSeats.ids(proposal), 'your trustee share');
    const keys = await keyDirectory.sharable(trusteeSeats.ids(proposal));
    const recipients = proposal.encrypted!.trustees.map((t) => {
      const publicKey = t.userId ? keys.get(t.userId) : undefined;
      if (!publicKey) throw new Error('A trustee’s key isn’t confirmed or no longer exists, so this vote can’t be set up. Confirm it in Settings, under Sign-in & security, or ask the admin to start the vote again.');
      return { position: t.position, publicKey };
    });
    const [{ default: dealingLine }, { default: dealShares }, { default: trusteeStatement }, { default: trusteeSignature }] = await Promise.all([
      import('../lib/ballot/dealingLine'),
      import('../lib/ballot/dealShares'),
      import('../lib/ballot/trusteeStatement'),
      import('../lib/ballot/trusteeSignature'),
    ]);
    const me = await unlocked();
    const dealing = await dealShares(proposal.id, position, dealingLine(me.seed, proposal.id, position), recipients);
    const signature = trusteeSignature.sign(trusteeStatement.reveal(proposal.id, position, me.userId, dealing.commitments, trusteeStatement.sharesDigest(dealing.shares)), me.signingPrivate);
    await http.put(`/proposals/${proposal.id}/dealing`, { ...dealing, signature });
  },

  // Step 3, as soon as the key is set up: check that the dealings are the trustees' own, open
  // the shares sealed to this trustee and check them against the dealers' commitments, before
  // anyone votes. A share that doesn't match becomes a signed complaint its dealer must answer.
  async checkShares(proposal: Proposal) {
    const position = seat(proposal);
    const enc = proposal.encrypted!;
    if (!enc.dealings?.every(Boolean)) throw new Error('The dealings aren’t all in yet.');
    const [{ default: checkShares }, { default: trusteeStatement }, { default: trusteeSignature }] = await Promise.all([import('../lib/ballot/checkShares'), import('../lib/ballot/trusteeStatement'), import('../lib/ballot/trusteeSignature')]);
    const me = await unlocked();
    const signers = await trusteeSeats.signers(enc.trustees);
    const result = await checkShares(proposal.id, position, enc.dealings as Dealing[], me, { signers, answered: trusteeSeats.answered(enc, position) });
    if (result.ok) {
      await http.post(`/proposals/${proposal.id}/shares-check`, { ok: true });
      return;
    }
    const signature = trusteeSignature.sign(trusteeStatement.complaint(proposal.id, position, me.userId, result.from), me.signingPrivate);
    await http.post(`/proposals/${proposal.id}/shares-check`, { ok: false, from: result.from, signature });
    throw new Error(`Trustee ${result.from}’s share doesn’t match what they committed to. Nil asked them to show it so everyone can check, and the vote waits until they do.`);
  },

  // A dealer answers each open complaint about their shares by showing the share, signed.
  async answer(proposal: Proposal) {
    const position = seat(proposal);
    const enc = proposal.encrypted!;
    const open = enc.complaints.filter((c) => c.dealer === position && !c.outcome);
    if (!open.length) return;
    const { default: answerComplaint } = await import('../lib/ballot/answerComplaint');
    const me = await unlocked();
    const signers = await trusteeSeats.signers(enc.trustees);
    for (const complaint of open) await http.post(`/proposals/${proposal.id}/share-answer`, answerComplaint(proposal.id, position, me, complaint, signers[complaint.accuser - 1]));
  },
};

export default trusteeSetup;
