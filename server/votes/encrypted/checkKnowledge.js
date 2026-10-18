import { Base8, addPoint, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import canonical from '../canonical.js';
import curvePoint from './curvePoint.js';
import knowledgeChallenge from './knowledgeChallenge.js';

const same = (a, b) => a[0] === b[0] && a[1] === b[1];

// Checks a Schnorr proof of knowledge of a with A = a·G: z·G must equal T + c·A. Without it a
// rogue trustee could publish A0 = t·G minus the others' commitments and end up holding the
// whole vote key t alone, since they never need to know the secret behind their own A0.
export default function checkKnowledge(proposalId, position, index, commitment, proof) {
  const t = curvePoint(proof?.t);
  const z = canonical.number(proof?.z, subOrder);
  if (!t || z === null) return false;
  const c = knowledgeChallenge(proposalId, position, index, [Base8, commitment, t]);
  return same(mulPointEscalar(Base8, BigInt(z)), addPoint(t, mulPointEscalar(commitment, c)));
}
