import { Base8, addPoint, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import curvePoint from './curvePoint';
import knowledgeChallenge from './knowledgeChallenge';

const same = (a: [bigint, bigint], b: [bigint, bigint]) => a[0] === b[0] && a[1] === b[1];

// Checks a trustee's proof of knowledge for one commitment: z·G must equal T + c·A. The same
// check the server runs, so a server that waved a rogue dealing through is caught here.
export default function checkKnowledge(proposalId: string, position: number, index: number, commitment: [bigint, bigint], proof: { t: unknown; z: unknown } | undefined) {
  const t = curvePoint(proof?.t);
  const z = typeof proof?.z === 'string' && /^\d{1,78}$/.test(proof.z) ? BigInt(proof.z) : null;
  if (!t || z === null || z >= subOrder) return false;
  const c = knowledgeChallenge(proposalId, position, index, [Base8, commitment, t]);
  return same(mulPointEscalar(Base8, z), addPoint(t, mulPointEscalar(commitment, c)));
}
