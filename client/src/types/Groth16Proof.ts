// A Groth16 proof as the prover hands it back: every number a decimal string.
export default interface Groth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: string;
  curve: string;
}
