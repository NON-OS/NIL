import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Compiles the encrypted-ballot circuit into `dir`, with the same compiler and libraries every
// time, and returns where its constraint system and prover landed.
export default function compileBallot(dir) {
  const libs = ['node_modules/circomlib/circuits', 'node_modules/@zk-kit/binary-merkle-root.circom/src'];
  execFileSync('node_modules/.bin/circom2', ['circuits/ballot.circom', '--r1cs', '--wasm', '--O2', ...libs.flatMap((l) => ['-l', l]), '-o', dir], { stdio: 'inherit' });
  return { r1cs: path.join(dir, 'ballot.r1cs'), wasm: path.join(dir, 'ballot_js', 'ballot.wasm') };
}
