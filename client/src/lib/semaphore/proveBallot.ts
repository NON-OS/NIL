import { groth16 } from 'snarkjs';
import { packGroth16Proof } from '@zk-kit/utils/proof-packing';
import type { Identity } from '@semaphore-protocol/identity';
import voterGroup from './voterGroup';
import fieldHash from './fieldHash';
import type AnonymousVote from '../../types/AnonymousVote';
import type BallotProof from '../../types/BallotProof';

// A Semaphore proof that "a member of this vote's group chose option N", made entirely in this
// browser from circuit files this server hosts. It runs single-threaded so the page needs no
// worker loaded from a data: URL; that costs a couple of seconds and nothing in safety.
export default async function proveBallot(identity: Identity, vote: AnonymousVote, choice: number): Promise<BallotProof> {
  const group = voterGroup(vote.members);
  const index = group.indexOf(identity.commitment);
  if (index < 0) throw new Error('You’re not on this vote’s voter list yet. Reload and try again.');
  const merkle = group.generateMerkleProof(index);
  const siblings = Array.from({ length: vote.depth }, (_, i) => merkle.siblings[i] ?? 0n);
  const { proof, publicSignals } = await groth16.fullProve(
    {
      secret: identity.secretScalar,
      merkleProofLength: merkle.siblings.length,
      merkleProofIndex: merkle.index,
      merkleProofSiblings: siblings,
      scope: fieldHash(vote.scope),
      message: fieldHash(BigInt(choice)),
    },
    `/zk/semaphore-${vote.depth}.wasm`,
    `/zk/semaphore-${vote.depth}.zkey`,
    undefined,
    {},
    { singleThread: true },
  );
  return {
    merkleTreeDepth: vote.depth,
    merkleTreeRoot: merkle.root.toString(),
    nullifier: String(publicSignals[1]),
    message: String(choice),
    scope: vote.scope,
    points: packGroth16Proof(proof).map(String),
  };
}
