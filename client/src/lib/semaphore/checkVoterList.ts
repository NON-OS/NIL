import { Group } from '@semaphore-protocol/group';
import { poseidon2 } from 'poseidon-lite/poseidon2';
import type AnonymousVoteView from '../../types/AnonymousVoteView';

const AGAIN = 'Reload and try again, and tell your admin if it keeps happening.';

// Compares the voter list fetched without the cookie with what this browser was shown signed in.
// The tree its members make has to be one the server takes ballots against right now, and the
// signed-in view has to share a root with it. A server that showed this member a list of its own
// would have to send the same list to a fetch it can't tell is theirs. In a weighted vote each
// leaf carries the member's power, as on the server.
export default function checkVoterList(view: AnonymousVoteView, signedInRoots: string[], weighted: boolean) {
  const group = new Group();
  view.members.forEach((m, i) => {
    group.addMember(weighted ? poseidon2([BigInt(m.commitment), BigInt(m.power ?? '0')]) : BigInt(m.commitment));
    if (m.removed) group.removeMember(i);
  });
  if (!view.roots.includes(group.root.toString())) throw new Error(`The voter list the server sent doesn’t match the one it takes ballots for, so Nil won’t vote with it. ${AGAIN}`);
  if (!signedInRoots.some((root) => view.roots.includes(root))) throw new Error(`The server showed you a different voter list from the one it sends to everyone, so Nil won’t vote with it. ${AGAIN}`);
}
