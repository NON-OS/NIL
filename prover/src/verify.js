import { groth16 } from 'snarkjs';
import singleThreadCurve from './singleThreadCurve.js';

// Whether a Groth16 proof holds for its public signals under a verification key. A proof that
// can't even be read counts as not holding.
export default async function verify({ key, publicSignals, proof }) {
  await singleThreadCurve();
  try {
    return { valid: await groth16.verify(key, publicSignals, proof) };
  } catch {
    return { valid: false };
  }
}
