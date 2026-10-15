import { Group } from '@semaphore-protocol/group';

// The Merkle root of a voter group, built exactly as every browser builds it: members in
// position order, and a removed member's leaf emptied in place so nobody else's position moves.
export default function groupRoot(members) {
  if (!members.length) return null;
  const group = new Group();
  members.forEach((m, i) => {
    group.addMember(BigInt(m.commitment));
    if (m.removed) group.removeMember(i);
  });
  return group.root.toString();
}
