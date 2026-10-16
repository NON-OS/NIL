import HttpError from '../../lib/HttpError.js';
import curvePoint from './curvePoint.js';
import dealingCommit from './dealingCommit.js';
import checkKnowledge from './checkKnowledge.js';

const SEALED = /^[A-Za-z0-9_-]{100,200}$/;

// A trustee's revealed dealing: the two commitments they hashed earlier, a proof of knowledge
// for each, and a sealed share for every trustee. Returns what gets stored.
export default function parseReveal(proposalId, trustee, body) {
  const commitments = Array.isArray(body?.commitments) && body.commitments.length === 2 ? body.commitments.map(curvePoint) : null;
  if (!commitments || commitments.some((c) => !c)) throw HttpError.badRequest('Those commitments aren’t valid curve points.');
  if (dealingCommit(proposalId, trustee.position, commitments) !== trustee.commitment) throw HttpError.badRequest('That dealing doesn’t match what you committed to.');
  const proofs = Array.isArray(body?.proofs) && body.proofs.length === 2 ? body.proofs : null;
  if (!proofs || !commitments.every((c, i) => checkKnowledge(proposalId, trustee.position, i, c, proofs[i]))) throw HttpError.badRequest('The proofs of knowledge for that dealing don’t check out.');
  const shares = body?.shares;
  if (!shares || ![1, 2, 3].every((j) => typeof shares[j] === 'string' && SEALED.test(shares[j]))) throw HttpError.badRequest('A dealing needs one sealed share for each trustee.');
  return {
    commitments: commitments.map((c) => c.map(String)),
    proofs: proofs.map((p) => ({ t: p.t.map(String), z: p.z })),
    shares: { 1: shares[1], 2: shares[2], 3: shares[3] },
  };
}
