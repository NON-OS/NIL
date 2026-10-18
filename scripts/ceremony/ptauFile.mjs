import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Phase 1 of the setup: the Perpetual Powers of Tau, built by more than 80 people, at the size
// the ballot circuit needs. It's downloaded once into the ceremony folder and checked against
// the hash phase 1 was recorded with. PTAU points at a copy you already have.
const URL = 'https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/ppot_0080_16.ptau';

export default async function ptauFile(dir) {
  const file = process.env.PTAU || path.join(dir, path.basename(URL));
  if (!fs.existsSync(file)) {
    console.log(`Downloading phase 1 (${path.basename(URL)}, about 75 MB)`);
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`Phase 1 didn't download: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const expected = JSON.parse(fs.readFileSync('circuits/CEREMONY.json', 'utf8')).phase1.sha256;
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) throw new Error(`${file} isn't the phase 1 file the ballot circuit uses (sha256 ${actual}).`);
  return file;
}
