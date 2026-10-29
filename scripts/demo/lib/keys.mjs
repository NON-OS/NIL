import fs from 'node:fs';
import path from 'node:path';
import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import demoDir from './demoDir.mjs';
import people from './people.mjs';

// Throwaway wallet keys, made once per demo folder and kept there so every script signs in as
// the same four people. They hold nothing and never leave this machine.
export default function keys() {
  const file = path.join(demoDir, 'people.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const made = Object.fromEntries(people.map((p) => [p.id, bytesToHex(secp256k1.utils.randomPrivateKey())]));
  fs.writeFileSync(file, JSON.stringify(made), { mode: 0o600 });
  return made;
}
