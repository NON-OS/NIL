import type Point from './point';

// A trustee's revealed dealing as it travels: commitments to their line, a proof of knowledge
// for each, and the shares sealed to each trustee by seat.
type Dealing = {
  commitments: [Point, Point];
  proofs: { t: Point; z: string }[];
  shares: Record<number, string>;
};

export default Dealing;
