// Downloads the Privacy Pools circuit files into client/public/zk/privacy-pools, so browsers
// load them from this server and never from a third party. Each file must match the SHA-256
// that @0xbow/privacy-pools-core-sdk 1.5.0 pins in src/circuits/artifactHashes.ts, taken from
// the trusted-setup ceremony outputs; anything else is refused and removed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SOURCE = 'https://privacypools.com/artifacts';
const PINNED = {
  'withdraw.wasm': '36cda22791def3d520a55c0fc808369cd5849532a75fab65686e666ed3d55c10',
  'withdraw.zkey': '2a893b42174c813566e5c40c715a8b90cd49fc4ecf384e3a6024158c3d6de677',
  'withdraw.vkey': '666bd0983b20c1611543b04f7712e067fbe8cad69f07ada8a310837ff398d21e',
  'commitment.wasm': '254d2130607182fd6fd1aee67971526b13cfe178c88e360da96dce92663828d8',
  'commitment.zkey': '494ae92d64098fda2a5649690ddc5821fcd7449ca5fe8ef99ee7447544d7e1f3',
  'commitment.vkey': '7d48b4eb3dedc12fb774348287b587f0c18c3c7254cd60e9cf0f8b3636a570d8',
};

const dir = path.resolve('client/public/zk/privacy-pools');
fs.mkdirSync(dir, { recursive: true });
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

for (const [name, hash] of Object.entries(PINNED)) {
  const file = path.join(dir, name);
  if (fs.existsSync(file) && sha256(file) === hash) continue;
  const res = await fetch(`${SOURCE}/${name}`, { redirect: 'error' });
  if (!res.ok) throw new Error(`Download failed for ${name}: HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  if (sha256(file) !== hash) {
    fs.rmSync(file);
    throw new Error(`${name} doesn't match its pinned hash; refusing it.`);
  }
}
console.log('Privacy Pools circuit files in place, each matching its pinned hash.');
