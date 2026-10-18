import { curves, groth16 } from 'snarkjs';
// the same verification key the server checks ballots with, built into the app
import key from '../../../../server/votes/ballotKey.json';

const shared = globalThis as { curve_bn128?: unknown };
let curve: Promise<void> | null = null;

// snarkjs verifies on a curve it builds with worker threads started from a blob: URL, which the
// page's Content Security Policy doesn't allow. Unless there's a shared curve already, a
// single-threaded one, built once and left where snarkjs looks for it, does the same work in
// this thread.
function singleThreaded() {
  curve ??= shared.curve_bn128
    ? Promise.resolve()
    : curves.getCurveFromName('bn128', { singleThread: true }).then((c) => {
        shared.curve_bn128 ??= c;
      });
  return curve;
}

// Whether one encrypted ballot's Groth16 proof holds for its public signals.
export default async function verifyBallotProof(publicSignals: string[], proof: unknown) {
  await singleThreaded();
  try {
    return await groth16.verify(key, publicSignals, proof);
  } catch {
    return false;
  }
}
