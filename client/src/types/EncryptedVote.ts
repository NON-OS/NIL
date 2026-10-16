import type Point from '../lib/ballot/point';

export default interface EncryptedVote {
  // null until all three trustees have dealt their shares
  publicKey: Point | null;
  trustees: { position: number; userId: string | null; dealt: boolean; decrypted: boolean }[];
  // members who had voting power when the vote opened
  eligible: number;
  // trustees only: every dealing, so each can open the shares sealed to them
  dealings: ({ commitments: [Point, Point]; shares: Record<number, string> } | null)[] | null;
  // trustees only, once closed: every option's summed ciphertext
  aggregates: { c1: Point; c2: Point }[] | null;
}
