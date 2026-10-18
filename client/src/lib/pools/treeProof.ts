import { Group } from '@semaphore-protocol/group';

// The circuits take Merkle proofs padded to 32 siblings, as the Privacy Pools app sends them.
const DEPTH = 32;

// A Lean IMT inclusion proof for one leaf, from a tree rebuilt here from every leaf, and only
// if that tree has the root the chain holds. Leaves from the server or the association set
// provider that differ in any way give another root and no proof.
export default function treeProof(leaves: string[], leaf: bigint, root: string, what: string) {
  const group = new Group(leaves.map(BigInt));
  if (group.root.toString() !== root) throw new Error(`The ${what} Nil was sent doesn’t match the one on-chain. Try again in a minute.`);
  const index = group.indexOf(leaf);
  if (index < 0) throw new Error(what === 'association set' ? 'This deposit isn’t approved by the association set yet.' : 'This deposit isn’t in the pool’s tree yet. Try again once it’s mined.');
  const proof = group.generateMerkleProof(index);
  return { root: BigInt(root), index: BigInt(proof.index), siblings: [...proof.siblings, ...Array(DEPTH - proof.siblings.length).fill(0n)], depth: BigInt(DEPTH) };
}
