import { Base8, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import randomScalar from './randomScalar';
import knowledgeChallenge from './knowledgeChallenge';

// A Schnorr proof that this trustee knows a with A = a·G, without showing a: a random T = w·G,
// the challenge c over (G, A, T) and z = w + c·a.
export default function proveKnowledge(proposalId: string, position: number, index: number, secret: bigint, commitment: [bigint, bigint]) {
  const w = randomScalar();
  const t = mulPointEscalar(Base8, w);
  const c = knowledgeChallenge(proposalId, position, index, [Base8, commitment, t]);
  return { t: t.map(String) as [string, string], z: ((w + c * secret) % subOrder).toString() };
}
