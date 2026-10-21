import proveCircuit from '../prover/proveCircuit';
import type { Secrets } from './poolSecrets';

// The proof a ragequit needs: "I know the secrets of this commitment", which lets the wallet
// that deposited take its value back publicly, approved or not.
const FILES = { wasm: '/zk/privacy-pools/commitment.wasm', zkey: '/zk/privacy-pools/commitment.zkey' };

export default async function proveCommitment(input: { value: bigint; label: bigint; secrets: Secrets }, files = FILES) {
  const { proof, publicSignals } = await proveCircuit({ value: input.value, label: input.label, nullifier: input.secrets.nullifier, secret: input.secrets.secret }, files.wasm, files.zkey);
  return { proof: { pi_a: proof.pi_a, pi_b: proof.pi_b, pi_c: proof.pi_c }, publicSignals };
}
