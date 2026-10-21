import { packGroth16Proof } from '@zk-kit/utils/proof-packing';
import { Group } from '@semaphore-protocol/group';
import type { Identity } from '@semaphore-protocol/identity';
import proveCircuit from '../prover/proveCircuit';
import fieldHash from '../semaphore/fieldHash';
import type BallotProof from '../../types/BallotProof';

// A Semaphore proof that "a member of this list spent this scope on this message", made in this
// browser from the circuit files this server hosts, like ballots.
export default async function proveCredit(identity: Identity, members: string[], depth: number, scope: string, message: string): Promise<BallotProof> {
  const group = new Group(members.map(BigInt));
  const index = group.indexOf(identity.commitment);
  if (index < 0) throw new Error('Your voting key isn’t on the member list yet. Reload and try again.');
  const merkle = group.generateMerkleProof(index);
  const siblings = Array.from({ length: depth }, (_, i) => merkle.siblings[i] ?? 0n);
  const { proof, publicSignals } = await proveCircuit(
    {
      secret: identity.secretScalar,
      merkleProofLength: merkle.siblings.length,
      merkleProofIndex: merkle.index,
      merkleProofSiblings: siblings,
      scope: fieldHash(scope),
      message: fieldHash(message),
    },
    `/zk/semaphore-${depth}.wasm`,
    `/zk/semaphore-${depth}.zkey`,
  );
  return {
    merkleTreeDepth: depth,
    merkleTreeRoot: merkle.root.toString(),
    nullifier: String(publicSignals[1]),
    message,
    scope,
    points: packGroth16Proof(proof).map(String),
  };
}
