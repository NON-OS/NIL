import { Group } from '@semaphore-protocol/group';
import type AnonymousVote from '../../types/AnonymousVote';

// The vote's voter tree, rebuilt exactly as the server builds it.
export default function voterGroup(members: AnonymousVote['members']) {
  const group = new Group();
  members.forEach((m, i) => {
    group.addMember(BigInt(m.commitment));
    if (m.removed) group.removeMember(i);
  });
  return group;
}
