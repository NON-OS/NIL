import crypto from 'node:crypto';
import { Group } from '@semaphore-protocol/group';
import { poseidon2 } from 'poseidon-lite/poseidon2';
import { groth16 } from 'snarkjs';
import fieldHash from '../../votes/fieldHash.js';

const ZK = new URL('../../../client/public/zk/', import.meta.url).pathname;

// What a voter's browser does for an encrypted ballot: rebuild the census with each leaf
// Poseidon(identity, power), find its own seat and prove a ballot for `choice` under the vote's
// key. `tamper` overrides any circuit input, the way a cheating voter would.
export default function proveEncrypted(identity, vote, choice, tamper = {}) {
  const members = vote.anonymous.members;
  const group = new Group();
  members.forEach((m, i) => {
    group.addMember(poseidon2([BigInt(m.commitment), BigInt(m.power)]));
    if (m.removed) group.removeMember(i);
  });
  const index = members.findIndex((m) => m.commitment === identity.commitment.toString());
  const merkle = group.generateMerkleProof(index);
  return groth16.fullProve(
    {
      secret: identity.secretScalar,
      power: members[index].power,
      merkleProofLength: merkle.siblings.length,
      merkleProofIndex: merkle.index,
      merkleProofSiblings: Array.from({ length: 16 }, (_, i) => merkle.siblings[i] ?? 0n),
      choice,
      randomness: Array.from({ length: 8 }, () => BigInt(`0x${crypto.randomBytes(31).toString('hex')}`) >> 1n),
      scope: fieldHash(vote.anonymous.scope),
      optionCount: vote.options.length,
      publicKey: vote.encrypted.publicKey,
      ...tamper,
    },
    `${ZK}ballot.wasm`,
    `${ZK}ballot.zkey`,
  );
}
