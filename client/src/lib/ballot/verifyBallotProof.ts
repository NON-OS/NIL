import verifyCircuit from '../prover/verifyCircuit';
// the same verification key the server checks ballots with, built into the app
import key from '../../../../server/votes/ballotKey.json';

// Whether one encrypted ballot's Groth16 proof holds for its public signals.
export default function verifyBallotProof(publicSignals: string[], proof: unknown) {
  return verifyCircuit(key, publicSignals, proof);
}
