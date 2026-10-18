import { groth16 } from 'snarkjs';
import type { Secrets } from './poolSecrets';

// The proof a ragequit needs: "I know the secrets of this commitment", which lets the wallet
// that deposited take its value back publicly, approved or not.
const FILES = { wasm: '/zk/privacy-pools/commitment.wasm', zkey: '/zk/privacy-pools/commitment.zkey' };

export default async function proveCommitment(input: { value: bigint; label: bigint; secrets: Secrets }, files = FILES) {
  const { proof, publicSignals } = await groth16.fullProve(
    { value: input.value, label: input.label, nullifier: input.secrets.nullifier, secret: input.secrets.secret },
    files.wasm,
    files.zkey,
    undefined,
    {},
    { singleThread: true },
  );
  return { proof: { pi_a: proof.pi_a.map(String), pi_b: proof.pi_b.map((p: unknown[]) => p.map(String)), pi_c: proof.pi_c.map(String) }, publicSignals: publicSignals.map(String) };
}
