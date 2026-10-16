import fs from 'node:fs';
import { groth16 } from 'snarkjs';
import HttpError from '../../lib/HttpError.js';
import voteScope from '../voteScope.js';
import fieldHash from '../fieldHash.js';
import voterGroups from '../voterGroups.js';

const KEY = JSON.parse(fs.readFileSync(new URL('../ballotKey.json', import.meta.url)));
const OPTIONS = 8;
const DIGITS = /^\d{1,78}$/;
const refuse = (why) => HttpError.badRequest(`That ballot was refused: ${why}.`);
const digits = (v) => typeof v === 'string' && DIGITS.test(v);

// Public signals of the ballot circuit, in order: merkleRoot, nullifier, c1[8][2], c2[8][2],
// then the public inputs scope, optionCount, publicKey[2].
export default async function checkEncryptedBallot(proposal, options, body) {
  const signals = body?.publicSignals;
  const proof = body?.proof;
  if (!Array.isArray(signals) || signals.length !== 2 + 4 * OPTIONS + 4 || !signals.every(digits)) throw refuse('malformed public values');
  if (!proof || !['pi_a', 'pi_b', 'pi_c'].every((k) => Array.isArray(proof[k])) || ![proof.pi_a, proof.pi_c, ...proof.pi_b].flat().every(digits)) throw refuse('malformed proof');
  const publicKey = JSON.parse(proposal.public_key);
  const [scope, optionCount, pkX, pkY] = signals.slice(2 + 4 * OPTIONS);
  if (scope !== fieldHash(voteScope(proposal.id))) throw refuse('it was made for a different vote');
  if (Number(optionCount) !== options.length) throw refuse('it was made for a different set of options');
  if (pkX !== publicKey[0] || pkY !== publicKey[1]) throw refuse('it was encrypted to a different key');
  if (!voterGroups.acceptedRoots(proposal.id).has(signals[0])) throw refuse('the voter list changed since it was made; vote again');

  let valid = false;
  try {
    valid = await groth16.verify(KEY, signals, { protocol: 'groth16', curve: 'bn128', pi_a: proof.pi_a, pi_b: proof.pi_b, pi_c: proof.pi_c });
  } catch {
    valid = false;
  }
  if (!valid) throw refuse('the proof doesn’t verify');

  const at = (i) => signals[2 + i];
  const ciphertexts = Array.from({ length: options.length }, (_, k) => ({
    c1: [at(k * 2), at(k * 2 + 1)],
    c2: [at(2 * OPTIONS + k * 2), at(2 * OPTIONS + k * 2 + 1)],
  }));
  return { nullifier: signals[1], ciphertexts };
}
