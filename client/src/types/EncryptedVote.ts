import type Point from '../lib/ballot/point';
import type Dealing from '../lib/ballot/dealing';
import type { PublicDealing } from '../lib/ballot/dealing';

export default interface EncryptedVote {
  // null until all three trustees have revealed their dealings
  publicKey: Point | null;
  // `shares` is each trustee's check of the shares dealt to them, once the key is set up
  trustees: { position: number; userId: string | null; committed: boolean; dealt: boolean; shares: 'ok' | 'bad' | null; decrypted: boolean }[];
  // a dealer showed a share that doesn't match their commitments; the vote never takes ballots
  disputed: boolean;
  // signed complaints about shares, with the dealer's signed answer: null while it's awaited,
  // 'answered' when the share they showed matches, 'failed' when it doesn't
  complaints: { accuser: number; dealer: number; signature: string; share: string | null; answerSignature: string | null; outcome: 'answered' | 'failed' | null }[];
  // everyone: each trustee's signed dealing without the shares, to rebuild the key with
  commitments: (PublicDealing | null)[];
  // members who had voting power when the vote opened
  eligible: number;
  // trustees only: every dealing, so each can open the shares sealed to them
  dealings: (Dealing | null)[] | null;
  // trustees only, once closed: every option's summed ciphertext, as the server says it counted
  aggregates: { c1: Point; c2: Point }[] | null;
}
