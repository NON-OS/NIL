import { Group } from '@semaphore-protocol/group';
import { poseidon2 } from 'poseidon-lite/poseidon2';

// The Merkle root of a voter group, built exactly as every browser builds it: members in
// position order, and a removed member's leaf emptied in place so nobody else's position moves.
// In a weighted vote each leaf is Poseidon(identity, power), so a proof carries its weight.
export default function groupRoot(members) {
  if (!members.length) return null;
  const group = new Group();
  members.forEach((m, i) => {
    group.addMember(m.power ? poseidon2([BigInt(m.commitment), BigInt(m.power)]) : BigInt(m.commitment));
    if (m.removed) group.removeMember(i);
  });
  return group.root.toString();
}
