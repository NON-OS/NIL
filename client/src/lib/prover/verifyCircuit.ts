import proverCall from './proverCall';

// Whether a Groth16 proof holds for its public signals under `key`, checked by the prover. A
// proof that doesn't hold is false; a prover that can't run at all is an error, never a verdict.
export default async function verifyCircuit(key: unknown, publicSignals: string[], proof: unknown) {
  const { valid } = await proverCall<{ valid: boolean }>({ op: 'verify', key, publicSignals, proof });
  return valid === true;
}
