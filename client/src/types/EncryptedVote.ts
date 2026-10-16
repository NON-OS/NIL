import type Point from '../lib/ballot/point';
import type Dealing from '../lib/ballot/dealing';

export default interface EncryptedVote {
  // null until all three trustees have revealed their dealings
  publicKey: Point | null;
  // `shares` is each trustee's check of the shares dealt to them, once the key is set up
  trustees: { position: number; userId: string | null; committed: boolean; dealt: boolean; shares: 'ok' | 'bad' | null; decrypted: boolean }[];
  // a trustee found a share that doesn't match its dealer's commitments; no ballots are taken
  disputed: boolean;
  // everyone: each trustee's revealed commitments and proofs of knowledge, to rebuild the key
  commitments: (Pick<Dealing, 'commitments' | 'proofs'> | null)[];
  // members who had voting power when the vote opened
  eligible: number;
  // trustees only: every dealing, so each can open the shares sealed to them
  dealings: (Dealing | null)[] | null;
  // trustees only, once closed: every option's summed ciphertext
  aggregates: { c1: Point; c2: Point }[] | null;
}
