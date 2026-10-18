import { verifyProof } from '@semaphore-protocol/proof';
import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import utcDay from './utcDay.js';
import creditScope from './creditScope.js';
import creditMessage from './creditMessage.js';
import creditGroup from './creditGroup.js';
import canonical from '../votes/canonical.js';

const refuse = (why, status = 400) => new HttpError(status, `That AI request was refused: ${why}.`);

// Checks an anonymous AI request without learning who sent it. The proof shows that some current
// member, spending one of today's slots, asked for exactly this payload, and nothing more. Its
// nullifier is the same every time one member spends one slot, which is what the ledger counts.
export default async function checkCredit(feature, { day, slot, payload, proof } = {}) {
  if (typeof payload !== 'string') throw refuse('no request');
  if (!proof || typeof proof !== 'object') throw refuse('no proof');
  const { merkleTreeDepth, merkleTreeRoot, nullifier, message, scope, points } = proof;
  if (merkleTreeDepth !== config.semaphore.depth) throw refuse('it was made for a different circuit');
  // one spelling per number: the ledger tells nullifiers apart by their text, and "0" + n would
  // verify like n and spend the same slot twice
  if (![merkleTreeRoot, nullifier, message, scope].every((v) => canonical.number(v) !== null)) throw refuse('malformed numbers');
  if (!Array.isArray(points) || points.length !== 8 || !canonical.all(points, canonical.base)) throw refuse('malformed proof');
  // 409 like a moved member list: across midnight the browser just tries again with the new day
  if (day !== utcDay()) throw refuse('it was made for a different day; try again', 409);
  if (!Number.isInteger(slot) || slot < 0 || slot >= config.ai.perDay) throw refuse('that slot doesn’t exist');
  if (scope !== creditScope(day, slot)) throw refuse('it was made for a different slot or workspace');
  if (message !== creditMessage(feature, payload)) throw refuse('the proof was made for a different request');
  if (!creditGroup.accepts(merkleTreeRoot)) throw refuse('the member list changed since it was made; try again', 409);
  let valid = false;
  try {
    valid = await verifyProof({ merkleTreeDepth, merkleTreeRoot, nullifier, message, scope, points });
  } catch {
    valid = false;
  }
  if (!valid) throw refuse('the proof doesn’t verify');
  return { nullifier, scope, day };
}
