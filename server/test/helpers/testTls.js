import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// The certificate authority's extensions, spelled out in a config file rather than flags, so the
// same commands work with OpenSSL and with the LibreSSL that macOS ships.
const CONFIG = `[req]
distinguished_name = dn
x509_extensions = ca
prompt = no
[dn]
CN = Nil test CA
[ca]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
`;

// A throwaway certificate authority and one certificate it signed for `host`, made with openssl
// in a temporary folder when a test starts, so no private key ever sits in the repository.
export default function testTls(host) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-tls-'));
  const file = (name) => path.join(dir, name);
  const run = (...args) => execFileSync('openssl', args, { stdio: 'ignore' });
  fs.writeFileSync(file('ca.cnf'), CONFIG);
  fs.writeFileSync(file('host.cnf'), `basicConstraints = CA:FALSE\nkeyUsage = digitalSignature\nextendedKeyUsage = serverAuth\nsubjectAltName = DNS:${host}\n`);
  try {
    run('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', file('ca.key'));
    run('req', '-new', '-x509', '-config', file('ca.cnf'), '-key', file('ca.key'), '-days', '1', '-out', file('ca.crt'));
    run('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', file('host.key'));
    run('req', '-new', '-key', file('host.key'), '-subj', `/CN=${host}`, '-out', file('host.csr'));
    run('x509', '-req', '-in', file('host.csr'), '-CA', file('ca.crt'), '-CAkey', file('ca.key'), '-set_serial', '1', '-days', '1', '-extfile', file('host.cnf'), '-out', file('host.crt'));
    return { ca: fs.readFileSync(file('ca.crt')), key: fs.readFileSync(file('host.key')), cert: fs.readFileSync(file('host.crt')) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
