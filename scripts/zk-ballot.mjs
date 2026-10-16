// Builds the encrypted-ballot circuit and runs its Groth16 setup.
//
//   PTAU=path/to/ppot_0080_16.ptau npm run zk:ballot
//
// Phase 1 is the Perpetual Powers of Tau (PSE, 80+ contributors). Phase 2 here adds random
// contributions (CONTRIBUTORS, default 2) and a public beacon (a recent Ethereum block hash),
// then verifies the chain. All of these contributions run on this one machine, which makes it a
// development setup. Before high-stakes use, run phase 2 as a real ceremony: pass the zkey
// between people who don't trust each other, each running `snarkjs zkey contribute`, then
// apply the beacon and verify, and replace the files this script writes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { zKey } from 'snarkjs';

const ptau = process.env.PTAU;
if (!ptau || !fs.existsSync(ptau)) throw new Error('Set PTAU to the Perpetual Powers of Tau file (ppot_0080_16.ptau).');
const rpc = process.env.BEACON_RPC || 'https://ethereum-rpc.publicnode.com';
const out = path.resolve('client/public/zk');
const build = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'nonos-ballot-'));
const log = { info: console.log, warn: console.warn, error: console.error, debug: () => {} };

execFileSync('node_modules/.bin/circom2', ['circuits/ballot.circom', '--r1cs', '--wasm', '--O2', '-l', 'node_modules/circomlib/circuits', '-l', 'node_modules/@zk-kit/binary-merkle-root.circom/src', '-o', build], { stdio: 'inherit' });
const r1cs = path.join(build, 'ballot.r1cs');

const steps = [path.join(build, 'ballot_0.zkey')];
await zKey.newZKey(r1cs, ptau, steps[0], log);
const contributors = Number(process.env.CONTRIBUTORS || 2);
const transcript = [];
for (let i = 1; i <= contributors; i++) {
  const next = path.join(build, `ballot_${i}.zkey`);
  const hash = await zKey.contribute(steps.at(-1), next, `NONOS contribution ${i}`, crypto.randomBytes(64).toString('hex'), log);
  transcript.push({ contribution: i, hash: Buffer.from(hash).toString('hex') });
  steps.push(next);
}

// the beacon: a block hash nobody could have known when the contributions above were made
const head = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] }) }).then((r) => r.json());
const beacon = head.result.hash.slice(2);
const final = path.join(build, 'ballot_final.zkey');
await zKey.beacon(steps.at(-1), final, 'NONOS beacon', beacon, 10, log);

if (!(await zKey.verifyFromR1cs(r1cs, ptau, final, log))) throw new Error('The setup chain did not verify.');
const vkey = await zKey.exportVerificationKey(final, log);

fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(build, 'ballot_js/ballot.wasm'), path.join(out, 'ballot.wasm'));
fs.copyFileSync(final, path.join(out, 'ballot.zkey'));
fs.writeFileSync('server/votes/ballotKey.json', `${JSON.stringify(vkey, null, 2)}\n`);
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
fs.writeFileSync(
  'circuits/CEREMONY.json',
  `${JSON.stringify({ circuit: 'circuits/ballot.circom', phase1: { file: path.basename(ptau), sha256: sha(ptau) }, phase2: transcript, beacon: { blockNumber: Number(head.result.number), blockHash: head.result.hash, iterationsExp: 10 }, artifacts: { wasm: sha(path.join(out, 'ballot.wasm')), zkey: sha(path.join(out, 'ballot.zkey')) }, at: new Date().toISOString() }, null, 2)}\n`,
);
console.log('Ballot circuit ready:', out);
process.exit(0);
