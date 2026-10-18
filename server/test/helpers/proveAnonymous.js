import { Group } from '@semaphore-protocol/group';
import { generateProof } from '@semaphore-protocol/proof';

const ZK = new URL('../../../client/public/zk/', import.meta.url).pathname;
const DEPTH = 16;
const artifacts = { wasm: `${ZK}semaphore-${DEPTH}.wasm`, zkey: `${ZK}semaphore-${DEPTH}.zkey` };

// The vote's voter tree, rebuilt from its member list the way a browser does.
const groupOf = (vote) => {
  const g = new Group();
  vote.anonymous.members.forEach((m, i) => {
    g.addMember(BigInt(m.commitment));
    if (m.removed) g.removeMember(i);
  });
  return g;
};

// A Semaphore ballot for `choice`, as a browser proves it. `group` replaces the vote's tree,
// the way an outsider would have to make one up.
export default function proveAnonymous(identity, vote, choice, { group = groupOf(vote) } = {}) {
  return generateProof(identity, group, choice, vote.anonymous.scope, DEPTH, artifacts);
}
