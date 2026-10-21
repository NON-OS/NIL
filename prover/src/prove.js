import { groth16 } from 'snarkjs';
import plain from './plain.js';

// One Groth16 proof from a circuit's witness generator and proving key, fetched from the URLs
// the app passes. Single-threaded, so this program starts no workers of its own.
export default async function prove({ input, wasm, zkey }) {
  const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey, undefined, {}, { singleThread: true });
  return { proof: plain(proof), publicSignals: plain(publicSignals) };
}
