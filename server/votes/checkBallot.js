import { verifyProof } from '@semaphore-protocol/proof';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import canonical from './canonical.js';
import voteScope from './voteScope.js';
import voterGroups from './voterGroups.js';

const refuse = (why) => HttpError.badRequest(`That ballot was refused: ${why}.`);

// Checks an anonymous ballot without learning who cast it: the proof shows that some member of
// the vote's group chose this option, under this vote's scope, and nothing else. The nullifier
// is the same for every ballot one member casts in one vote, which is what stops double voting.
export default async function checkBallot(proposal, options, proof) {
  if (!proof || typeof proof !== 'object') throw refuse('no proof');
  const { merkleTreeDepth, merkleTreeRoot, nullifier, message, scope, points } = proof;
  if (merkleTreeDepth !== config.semaphore.depth) throw refuse('it was made for a different circuit');
  if (![merkleTreeRoot, nullifier, message, scope].every((v) => canonical.number(v) !== null)) throw refuse('malformed numbers');
  if (!Array.isArray(points) || points.length !== 8 || !canonical.all(points, canonical.base)) throw refuse('malformed proof');
  if (scope !== voteScope(proposal.id)) throw refuse('it was made for a different vote');
  const choice = Number(message);
  if (choice >= options.length) throw refuse('that option doesn’t exist');
  if (!voterGroups.acceptedRoots(proposal.id).has(merkleTreeRoot)) throw refuse('the voter list changed since it was made; vote again');
  let valid = false;
  try {
    valid = await verifyProof({ merkleTreeDepth, merkleTreeRoot, nullifier, message, scope, points });
  } catch {
    valid = false;
  }
  if (!valid) throw refuse('the proof doesn’t verify');
  // only the fields the proof covers are kept, so what's stored is exactly what was checked
  return { choice, nullifier, proof: { merkleTreeDepth, merkleTreeRoot, nullifier, message, scope, points } };
}
