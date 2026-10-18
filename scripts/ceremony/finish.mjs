// Finishes the ballot ceremony: applies the public beacon to the last key, verifies the whole
// chain from phase 1 through every contribution, and only then installs the result: the prover
// key the app downloads, the verification key the server checks ballots with, and
// circuits/CEREMONY.json, the public record of who contributed.
//   npm run ceremony:finish -- ceremony/ballot_0005.zkey --beacon-block 23600000
// Announce the beacon block before the last contribution is made. BEACON_RPC picks the node.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { zKey } from 'snarkjs';
import compileBallot from './compileBallot.mjs';
import ptauFile from './ptauFile.mjs';
import beaconHash from './beaconHash.mjs';

const ITERATIONS_EXP = 10;
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const input = args.find((arg) => arg.endsWith('.zkey'));
const block = Number(option('--beacon-block'));
if (!input || !fs.existsSync(input) || !Number.isSafeInteger(block) || block <= 0) {
  console.error('Usage: npm run ceremony:finish -- ceremony/ballot_0005.zkey --beacon-block <announced block number>');
  process.exit(1);
}

const dir = path.resolve('ceremony');
fs.mkdirSync(dir, { recursive: true });
// the circuit compiles to the same files every time, so finishing on another machine works too
const compiled = fs.existsSync(path.join(dir, 'ballot.r1cs')) ? { r1cs: path.join(dir, 'ballot.r1cs'), wasm: path.join(dir, 'ballot_js', 'ballot.wasm') } : compileBallot(dir);
const ptau = await ptauFile(dir);
const hash = await beaconHash(process.env.BEACON_RPC || 'https://ethereum-rpc.publicnode.com', block);
const final = path.join(dir, 'ballot_final.zkey');
const quiet = { info: () => {}, warn: console.warn, error: console.error, debug: () => {} };
await zKey.beacon(input, final, `Ethereum block ${block}`, hash.slice(2), ITERATIONS_EXP, quiet);

// snarkjs lists every contribution while it verifies; that list becomes the public record
const said = [];
const listening = { ...quiet, info: (message) => said.push(String(message)) };
if (!(await zKey.verifyFromR1cs(compiled.r1cs, ptau, final, listening))) throw new Error('The ceremony chain did not verify. Nothing was installed.');
const chain = said
  .map((message) => message.match(/^contribution #(\d+) (.*):\n([\s\S]+)$/))
  .filter(Boolean)
  .map(([, n, name, hex]) => ({ contribution: Number(n), name: name.trim(), hash: hex.replace(/\s+/g, '') }))
  .sort((a, b) => a.contribution - b.contribution);
const people = chain.filter((c) => c.name !== `Ethereum block ${block}`);

const out = path.resolve('client/public/zk');
fs.copyFileSync(compiled.wasm, path.join(out, 'ballot.wasm'));
fs.copyFileSync(final, path.join(out, 'ballot.zkey'));
fs.writeFileSync('server/votes/ballotKey.json', `${JSON.stringify(await zKey.exportVerificationKey(final, quiet), null, 2)}\n`);
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const record = {
  circuit: 'circuits/ballot.circom',
  phase1: { file: path.basename(ptau), sha256: sha(ptau) },
  phase2: people,
  beacon: { blockNumber: block, blockHash: hash, iterationsExp: ITERATIONS_EXP },
  artifacts: { wasm: sha(path.join(out, 'ballot.wasm')), zkey: sha(path.join(out, 'ballot.zkey')) },
  at: new Date().toISOString(),
};
fs.writeFileSync('circuits/CEREMONY.json', `${JSON.stringify(record, null, 2)}\n`);
console.log(`Verified and installed. ${people.length} contributions:`);
for (const c of people) console.log(`  #${c.contribution} ${c.name}  ${c.hash.slice(0, 16)}…`);
console.log(`Beacon: Ethereum block ${block} (${hash})`);
process.exit(0);
