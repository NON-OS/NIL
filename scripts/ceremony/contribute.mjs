// Adds your contribution to the ballot ceremony. Takes the latest key, mixes in randomness from
// this machine that is thrown away when the command ends, and writes the next key to pass on.
//   npm run ceremony:contribute -- ballot_0003.zkey --name "Your name"
// The setup is safe as long as one contributor's randomness is gone for good, so close the
// terminal afterwards and don't keep notes of anything you typed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { zKey } from 'snarkjs';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const input = args.find((arg) => arg.endsWith('.zkey'));
const name = option('--name');
if (!input || !fs.existsSync(input) || !name) {
  console.error('Usage: npm run ceremony:contribute -- ballot_0003.zkey --name "Your name"');
  process.exit(1);
}
const number = Number(path.basename(input).match(/_(\d+)\.zkey$/)?.[1] ?? NaN);
if (!Number.isInteger(number)) {
  console.error('The key you were sent should be named like ballot_0003.zkey.');
  process.exit(1);
}
const output = path.join(path.dirname(input), `ballot_${String(number + 1).padStart(4, '0')}.zkey`);
const quiet = { info: () => {}, warn: console.warn, error: console.error, debug: () => {} };
const hash = await zKey.contribute(input, output, name, crypto.randomBytes(64).toString('hex'), quiet);
console.log(`\nDone. Pass on: ${output}`);
console.log(`Your contribution hash, to post where the ceremony is coordinated:\n${Buffer.from(hash).toString('hex')}`);
process.exit(0);
