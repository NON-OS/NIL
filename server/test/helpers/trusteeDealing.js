import crypto from 'node:crypto';
import { Base8, mulPointEscalar, subOrder } from '@zk-kit/baby-jubjub';
import dealingCommit from '../../votes/encrypted/dealingCommit.js';
import knowledgeChallenge from '../../votes/encrypted/knowledgeChallenge.js';

const rand = () => BigInt(`0x${crypto.randomBytes(32).toString('hex')}`) % subOrder;
const str = (p) => p.map(String);

// What a trustee's browser sends for a secret line f(x) = a0 + a1·x: first the commitment hash,
// later the reveal with a Schnorr proof of knowledge for each coefficient. Shares are stand-ins
// of the right shape, since the server can't open them anyway.
export default function trusteeDealing(proposalId, position, line) {
  const commitments = line.map((a) => mulPointEscalar(Base8, a));
  const proofs = line.map((a, index) => {
    const w = rand();
    const t = mulPointEscalar(Base8, w);
    const c = knowledgeChallenge(proposalId, position, index, [Base8, commitments[index], t]);
    return { t: str(t), z: ((w + c * a) % subOrder).toString() };
  });
  return {
    commitment: dealingCommit(proposalId, position, commitments),
    reveal: { commitments: commitments.map(str), proofs, shares: { 1: 'a'.repeat(123), 2: 'b'.repeat(123), 3: 'c'.repeat(123) } },
  };
}
