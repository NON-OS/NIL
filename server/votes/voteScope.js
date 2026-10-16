import crypto from 'node:crypto';

// The Semaphore scope of one anonymous vote. A member's nullifier is tied to it, so each member
// gets exactly one ballot per vote, and a proof made for one vote never counts for another.
// 31 bytes keeps it inside the circuit's field.
export default function voteScope(proposalId) {
  return BigInt(`0x${crypto.createHash('sha256').update(`nonos/vote/${proposalId}`).digest('hex').slice(0, 62)}`).toString();
}
