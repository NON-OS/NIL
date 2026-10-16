// Downloads the Semaphore circuit files for SEMAPHORE_DEPTH into client/public/zk, so browsers
// load them from this server and never from a third party. A file is kept only if it matches a
// pinned hash or, for depths without one, if a proof made with it verifies against the
// verification keys bundled in the @semaphore-protocol/proof package.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Identity } from '@semaphore-protocol/identity';
import { Group } from '@semaphore-protocol/group';
import { generateProof, verifyProof } from '@semaphore-protocol/proof';

const VERSION = '4.13.0';
const SOURCE = `https://snark-artifacts.pse.dev/semaphore/${VERSION}`;
const PINNED = {
  16: {
    wasm: '06df31461d17db86897fc234f0e6e5f5e2f6add1b8c821b5c6ae75030b3e0d7c',
    zkey: '948763c7315a337b7722c0344a28af4be66fbbc618474d6dbe9036e799d1a3b5',
  },
};

const depth = Number(process.env.SEMAPHORE_DEPTH || 16);
if (!Number.isInteger(depth) || depth < 1 || depth > 32) throw new Error('SEMAPHORE_DEPTH must be a whole number from 1 to 32.');
const dir = path.resolve('client/public/zk');
fs.mkdirSync(dir, { recursive: true });
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

for (const ext of ['wasm', 'zkey']) {
  const file = path.join(dir, `semaphore-${depth}.${ext}`);
  if (fs.existsSync(file) && (!PINNED[depth] || sha256(file) === PINNED[depth][ext])) continue;
  const res = await fetch(`${SOURCE}/semaphore-${depth}.${ext}`, { redirect: 'error' });
  if (!res.ok) throw new Error(`Download failed for depth ${depth} ${ext}: HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  if (PINNED[depth] && sha256(file) !== PINNED[depth][ext]) {
    fs.rmSync(file);
    throw new Error(`semaphore-${depth}.${ext} doesn't match its pinned hash; refusing it.`);
  }
}

// the real test: a proof from these files must verify under the package's own keys
const members = [new Identity('zk-fetch-a'), new Identity('zk-fetch-b')];
const proof = await generateProof(members[0], new Group(members.map((m) => m.commitment)), 1, 2, depth, {
  wasm: path.join(dir, `semaphore-${depth}.wasm`),
  zkey: path.join(dir, `semaphore-${depth}.zkey`),
});
if (!(await verifyProof(proof))) throw new Error(`Circuit files for depth ${depth} don't produce valid proofs; delete them and retry.`);
console.log(`Semaphore depth ${depth}: circuit files in place and proven to work.`);
process.exit(0);
