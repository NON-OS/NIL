import { groth16 } from 'snarkjs';
import type { Secrets } from './poolSecrets';

interface TreeProof {
  root: bigint;
  index: bigint;
  siblings: bigint[];
  depth: bigint;
}

// A Privacy Pools withdrawal proof, made in this browser from circuit files this server hosts
// (pinned to the SDK's published hashes): "I can spend a commitment in this pool's tree whose
// label the association set approves, and I'm taking `withdrawn` of its `value`, leaving the
// rest under new secrets", bound to the relayer's terms by `context`. Single-threaded, so the
// page needs no worker from a data: URL.
const FILES = { wasm: '/zk/privacy-pools/withdraw.wasm', zkey: '/zk/privacy-pools/withdraw.zkey' };

export default async function proveWithdrawal(input: { value: bigint; label: bigint; existing: Secrets; next: Secrets; withdrawn: bigint; context: bigint; state: TreeProof; asp: TreeProof }, files = FILES) {
  const { proof, publicSignals } = await groth16.fullProve(
    {
      withdrawnValue: input.withdrawn,
      stateRoot: input.state.root,
      stateTreeDepth: input.state.depth,
      ASPRoot: input.asp.root,
      ASPTreeDepth: input.asp.depth,
      context: input.context,
      label: input.label,
      existingValue: input.value,
      existingNullifier: input.existing.nullifier,
      existingSecret: input.existing.secret,
      newNullifier: input.next.nullifier,
      newSecret: input.next.secret,
      stateSiblings: input.state.siblings,
      stateIndex: input.state.index,
      ASPSiblings: input.asp.siblings,
      ASPIndex: input.asp.index,
    },
    files.wasm,
    files.zkey,
    undefined,
    {},
    { singleThread: true },
  );
  return { proof: { pi_a: proof.pi_a.map(String), pi_b: proof.pi_b.map((p: unknown[]) => p.map(String)), pi_c: proof.pi_c.map(String) }, publicSignals: publicSignals.map(String) };
}
