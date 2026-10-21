import { Group } from '@semaphore-protocol/group';
import { poseidon2 } from 'poseidon-lite/poseidon2';
import type { Identity } from '@semaphore-protocol/identity';
import proveCircuit from '../prover/proveCircuit';
import fieldHash from '../semaphore/fieldHash';
import type AnonymousVoteView from '../../types/AnonymousVoteView';
import type Point from './point';

const OPTIONS = 8;
const DEPTH = 16;

// An encrypted, weighted ballot, proven in this browser: the circuit encrypts your power into
// the chosen option and zero into the rest, under the trustees' joint key, and proves your
// leaf (identity, power) is in the census. The key is the one this browser rebuilt from the
// trustees' commitments (votePublicKey), not the server's copy.
export default async function proveEncryptedBallot(identity: Identity, vote: AnonymousVoteView, choice: number, publicKey: Point) {
  const members = vote.members;
  const index = members.findIndex((m) => m.commitment === identity.commitment.toString() && !m.removed);
  if (index < 0) throw new Error('You had no voting power when this vote opened, so you’re not in its census.');
  const group = new Group();
  members.forEach((m, i) => {
    group.addMember(poseidon2([BigInt(m.commitment), BigInt(m.power!)]));
    if (m.removed) group.removeMember(i);
  });
  const merkle = group.generateMerkleProof(index);
  const randomness = Array.from({ length: OPTIONS }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(31));
    return BigInt(`0x${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`);
  });
  return proveCircuit(
    {
      secret: identity.secretScalar,
      power: members[index].power,
      merkleProofLength: merkle.siblings.length,
      merkleProofIndex: merkle.index,
      merkleProofSiblings: Array.from({ length: DEPTH }, (_, i) => merkle.siblings[i] ?? 0n),
      choice,
      randomness,
      scope: fieldHash(vote.scope),
      optionCount: vote.optionCount,
      publicKey,
    },
    '/zk/ballot.wasm',
    '/zk/ballot.zkey',
  );
}
