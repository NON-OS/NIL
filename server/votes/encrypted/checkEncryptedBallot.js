import fs from 'node:fs';
import { groth16 } from 'snarkjs';
import HttpError from '../../lib/HttpError.js';
import canonical from '../canonical.js';
import voteScope from '../voteScope.js';
import fieldHash from '../fieldHash.js';
import voterGroups from '../voterGroups.js';

const KEY = JSON.parse(fs.readFileSync(new URL('../ballotKey.json', import.meta.url)));
const OPTIONS = 8;
const refuse = (why) => HttpError.badRequest(`That ballot was refused: ${why}.`);
const point = (p, width) => Array.isArray(p) && p.length === 3 && p.every((c) => (width === 1 ? typeof c === 'string' : Array.isArray(c) && c.length === 2));

// Public signals of the ballot circuit, in order: merkleRoot, nullifier, c1[8][2], c2[8][2],
// then the public inputs scope, optionCount, publicKey[2].
export default async function checkEncryptedBallot(proposal, options, body) {
  const signals = body?.publicSignals;
  const proof = body?.proof;
  if (!Array.isArray(signals) || signals.length !== 2 + 4 * OPTIONS + 4 || !canonical.all(signals)) throw refuse('malformed public values');
  if (!proof || !point(proof.pi_a, 1) || !point(proof.pi_b, 2) || !point(proof.pi_c, 1) || !canonical.all([proof.pi_a, proof.pi_b, proof.pi_c], canonical.base)) throw refuse('malformed proof');
  const publicKey = JSON.parse(proposal.public_key);
  const [scope, optionCount, pkX, pkY] = signals.slice(2 + 4 * OPTIONS);
  if (scope !== fieldHash(voteScope(proposal.id))) throw refuse('it was made for a different vote');
  if (Number(optionCount) !== options.length) throw refuse('it was made for a different set of options');
  if (pkX !== publicKey[0] || pkY !== publicKey[1]) throw refuse('it was encrypted to a different key');
  if (!voterGroups.acceptedRoots(proposal.id).has(signals[0])) throw refuse('the voter list changed since it was made; vote again');

  // only the parts the check reads are kept, so what's stored is exactly what was verified
  const checked = { pi_a: proof.pi_a, pi_b: proof.pi_b, pi_c: proof.pi_c, protocol: 'groth16', curve: 'bn128' };
  let valid = false;
  try {
    valid = await groth16.verify(KEY, signals, checked);
  } catch {
    valid = false;
  }
  if (!valid) throw refuse('the proof doesn’t verify');

  const at = (i) => signals[2 + i];
  const ciphertexts = Array.from({ length: options.length }, (_, k) => ({
    c1: [at(k * 2), at(k * 2 + 1)],
    c2: [at(2 * OPTIONS + k * 2), at(2 * OPTIONS + k * 2 + 1)],
  }));
  return { nullifier: signals[1], ciphertexts, proof: { proof: checked, publicSignals: signals } };
}
