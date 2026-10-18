// Starts the ballot ceremony: compiles the circuit, checks phase 1 and writes the first key,
// ceremony/ballot_0000.zkey, for the first contributor.
//   npm run ceremony:start
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { zKey } from 'snarkjs';
import compileBallot from './compileBallot.mjs';
import ptauFile from './ptauFile.mjs';

const dir = path.resolve('ceremony');
fs.mkdirSync(dir, { recursive: true });
const { r1cs } = compileBallot(dir);
const ptau = await ptauFile(dir);
const first = path.join(dir, 'ballot_0000.zkey');
await zKey.newZKey(r1cs, ptau, first, { info: () => {}, warn: console.warn, error: console.error, debug: () => {} });
const sha = crypto.createHash('sha256').update(fs.readFileSync(first)).digest('hex');
console.log(`\nReady: ${path.relative(process.cwd(), first)} (sha256 ${sha})`);
console.log('Send it to the first contributor. Keep this folder; ceremony:finish needs it.');
process.exit(0);
