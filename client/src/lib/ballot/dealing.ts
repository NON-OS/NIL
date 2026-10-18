import type Point from './point';

// A trustee's revealed dealing as everyone sees it: the hash they committed to and its signature,
// the commitments to their line with a proof of knowledge for each, a digest of the shares they
// sealed, and their signature over the commitments and that digest.
export type PublicDealing = {
  commitment: string;
  commitSignature: string | null;
  commitments: [Point, Point];
  proofs: { t: Point; z: string }[];
  sharesDigest: string | null;
  signature: string | null;
};

// The same dealing as trustees get it, with the shares sealed to each trustee by seat.
type Dealing = PublicDealing & { shares: Record<number, string> };

export default Dealing;
