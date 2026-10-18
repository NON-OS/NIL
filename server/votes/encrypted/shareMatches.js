import { Base8, addPoint, mulPointEscalar } from '@zk-kit/baby-jubjub';

// Whether a dealer's share for seat `position` lies on their committed line: s·G must equal
// A0 + position·A1. Browsers run the same check on the shares sealed to them.
export default function shareMatches([a0, a1], position, share) {
  const expected = addPoint(a0, mulPointEscalar(a1, BigInt(position)));
  const got = mulPointEscalar(Base8, BigInt(share));
  return got[0] === expected[0] && got[1] === expected[1];
}
