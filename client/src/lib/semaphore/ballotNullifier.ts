import { poseidon2 } from 'poseidon-lite/poseidon2';
import fieldHash from './fieldHash';

// Your nullifier in a vote: Poseidon(hash(scope), secret), the same value your proof published.
// Recomputing it locally is how the app knows you voted without the server ever knowing who.
export default function ballotNullifier(secretScalar: bigint, scope: string) {
  return poseidon2([fieldHash(scope), secretScalar]).toString();
}
