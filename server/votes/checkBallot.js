import { verifyProof } from '@semaphore-protocol/proof';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import voteScope from './voteScope.js';
import voterGroups from './voterGroups.js';

const DIGITS = /^\d{1,78}$/;
const refuse = (why) => HttpError.badRequest(`That ballot was refused: ${why}.`);

// Checks an anonymous ballot without learning who cast it: the proof shows that some member of
// the vote's group chose this option, under this vote's scope, and nothing else. The nullifier
// is the same for every ballot one member casts in one vote, which is what stops double voting.
export default async function checkBallot(proposal, options, proof) {
  if (!proof || typeof proof !== 'object') throw refuse('no proof');
  const { merkleTreeDepth, merkleTreeRoot, nullifier, message, scope, points } = proof;
  if (merkleTreeDepth !== config.semaphore.depth) throw refuse('it was made for a different circuit');
  if (![merkleTreeRoot, nullifier, message, scope].every((v) => typeof v === 'string' && DIGITS.test(v))) throw refuse('malformed numbers');
  if (!Array.isArray(points) || points.length !== 8 || !points.every((p) => typeof p === 'string' && DIGITS.test(p))) throw refuse('malformed proof');
  if (scope !== voteScope(proposal.id)) throw refuse('it was made for a different vote');
  const choice = Number(message);
  if (!Number.isInteger(choice) || choice < 0 || choice >= options.length) throw refuse('that option doesn’t exist');
  if (!voterGroups.acceptedRoots(proposal.id).has(merkleTreeRoot)) throw refuse('the voter list changed since it was made; vote again');
  let valid = false;
  try {
    valid = await verifyProof({ merkleTreeDepth, merkleTreeRoot, nullifier, message, scope, points });
  } catch {
    valid = false;
  }
  if (!valid) throw refuse('the proof doesn’t verify');
  return { choice, nullifier };
}
