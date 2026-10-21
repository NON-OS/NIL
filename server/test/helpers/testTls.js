import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// A throwaway certificate authority and one certificate it signed for `host`, made with openssl
// in a temporary folder when a test starts, so no private key ever sits in the repository.
export default function testTls(host) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-tls-'));
  const file = (name) => path.join(dir, name);
  const run = (...args) => execFileSync('openssl', args, { stdio: 'ignore' });
  run('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '1', '-subj', '/CN=Nil test CA', '-keyout', file('ca.key'), '-out', file('ca.crt'));
  run('req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-subj', `/CN=${host}`, '-keyout', file('host.key'), '-out', file('host.csr'));
  fs.writeFileSync(file('ext.cnf'), `subjectAltName=DNS:${host}\n`);
  run('x509', '-req', '-in', file('host.csr'), '-CA', file('ca.crt'), '-CAkey', file('ca.key'), '-CAcreateserial', '-days', '1', '-extfile', file('ext.cnf'), '-out', file('host.crt'));
  const out = { ca: fs.readFileSync(file('ca.crt')), key: fs.readFileSync(file('host.key')), cert: fs.readFileSync(file('host.crt')) };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}
