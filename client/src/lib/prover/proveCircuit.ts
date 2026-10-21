import proverCall from './proverCall';
import decimalInputs from './decimalInputs';
import type Groth16Proof from '../../types/Groth16Proof';

// A Groth16 proof of `input` for the circuit whose witness generator and proving key are at
// `wasm` and `zkey`, made by the prover in this browser.
export default async function proveCircuit(input: Record<string, unknown>, wasm: string, zkey: string) {
  const { proof, publicSignals } = await proverCall<{ proof: Groth16Proof; publicSignals: string[] }>({ op: 'prove', input: decimalInputs(input), wasm, zkey });
  return { proof, publicSignals };
}
