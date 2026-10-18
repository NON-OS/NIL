import store from '../state/store';
import keyDirectory from './keyDirectory';
import type Signer from '../lib/ballot/signer';
import type Proposal from '../types/Proposal';
import type EncryptedVote from '../types/EncryptedVote';

// Who sits in which trustee seat of an encrypted vote, as this browser sees it.
const trusteeSeats = {
  // this person's seat, or null
  of: (proposal: Proposal) => proposal.encrypted?.trustees.find((t) => t.userId === store.get().me?.id)?.position ?? null,

  ids: (proposal: Proposal) => proposal.encrypted!.trustees.map((t) => t.userId).filter((id): id is string => Boolean(id)),

  // The signing key this browser pinned for the trustee in each seat, which their signatures are
  // checked against: their current one, as the key directory trusts it for anything signed now.
  // The server says who sits where; the pins say whose key is whose.
  signers: (trustees: { userId: string | null }[]): Promise<Signer[]> =>
    Promise.all(
      trustees.map(async (t) => {
        const signingKey = t.userId ? (await keyDirectory.signers(t.userId, null))[0]?.key : undefined;
        return t.userId && signingKey ? { userId: t.userId, signingKey } : null;
      }),
    ),

  // The shares dealers showed in answer to this seat's complaints, by dealer.
  answered: (enc: EncryptedVote, position: number) =>
    Object.fromEntries(enc.complaints.filter((c) => c.accuser === position && c.outcome === 'answered' && c.share).map((c) => [c.dealer, c.share!])),
};

export default trusteeSeats;
