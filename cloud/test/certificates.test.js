import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import checkCertificates from '../ops/checkCertificates.js';
import testContext from './helpers/testContext.js';

const hasOpenssl = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const skip = !hasOpenssl && 'openssl isn’t installed';

// A throwaway CA and certificates from it, made with openssl, so the check runs against real
// chains without trusting anything outside the test.
function makeCa() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-certs-'));
  const run = (args) => execFileSync('openssl', args, { cwd: dir, stdio: 'ignore' });
  const ec = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes'];
  run(['req', '-x509', ...ec, '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '30', '-subj', '/CN=Nil test CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign']);
  let serial = 1;
  return {
    ca: fs.readFileSync(path.join(dir, 'ca.pem')),
    issue(days, names, { selfSigned = false } = {}) {
      const n = serial++;
      fs.writeFileSync(path.join(dir, `ext${n}.cnf`), `subjectAltName=${names.map((name) => `DNS:${name}`).join(',')}\nbasicConstraints=CA:FALSE\n`);
      run(['req', '-new', ...ec, '-keyout', `leaf${n}.key`, '-out', `leaf${n}.csr`, '-subj', `/CN=${names[0]}`]);
      const signer = selfSigned ? ['-signkey', `leaf${n}.key`] : ['-CA', 'ca.pem', '-CAkey', 'ca.key', '-set_serial', String(n)];
      run(['x509', '-req', '-in', `leaf${n}.csr`, ...signer, '-out', `leaf${n}.pem`, '-days', String(days), '-extfile', `ext${n}.cnf`]);
      return { key: fs.readFileSync(path.join(dir, `leaf${n}.key`)), cert: fs.readFileSync(path.join(dir, `leaf${n}.pem`)) };
    },
  };
}

async function serve(t, pair) {
  const seen = [];
  const context = tls.createSecureContext(pair);
  // recorded during the handshake, so before the client has its answer
  const server = tls.createServer({ SNICallback: (name, done) => (seen.push(name), done(null, context)) }, (socket) => socket.end());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { port: server.address().port, seen };
}

const wildcard = { CLOUD_TLS: 'wildcard', CLOUD_DNS_PROVIDER: 'cloudflare', CLOUD_CERT_CHECK_ADDRESS: '127.0.0.1' };

test('months left raises nothing; the sign-up host and a name under the wildcard are both checked', { skip }, async (t) => {
  const certs = makeCa();
  const { port, seen } = await serve(t, certs.issue(90, ['nil.test', '*.nil.test']));
  const ctx = testContext({ env: wildcard });
  const results = await checkCertificates(ctx, { port, ca: certs.ca });
  assert.deepEqual(results.map((r) => r.name), ['nil.test', 'health.nil.test']);
  assert.ok(results.every((r) => r.daysLeft >= 89 && r.daysLeft <= 90));
  assert.deepEqual(seen, ['nil.test', 'health.nil.test'], 'each name is asked for by name, like a visitor would');
  assert.deepEqual(ctx.alerts, []);
});

test('weeks left is a warning, days left is critical', { skip }, async (t) => {
  const certs = makeCa();
  const ctx = testContext({ env: wildcard });
  const weeks = await serve(t, certs.issue(10, ['nil.test', '*.nil.test']));
  await checkCertificates(ctx, { port: weeks.port, ca: certs.ca });
  assert.deepEqual(ctx.alerts.map((a) => a.event), ['tls.certificate_expiring']);
  assert.match(ctx.alerts[0].message, /within 21 days: nil\.test on \d{4}-\d\d-\d\d, in 9 days; health\.nil\.test/);
  assert.equal(ctx.alerts[0].repeatMin, 24 * 60, 'once a day, not every hour');

  const days = await serve(t, certs.issue(3, ['nil.test', '*.nil.test']));
  await checkCertificates(ctx, { port: days.port, ca: certs.ca });
  const [soon] = ctx.alerts.slice(1);
  assert.equal(soon.event, 'tls.certificate_expiring_soon');
  assert.equal(soon.severity, 'critical');
  assert.match(soon.message, /DNS token/);
});

test('a certificate that doesn’t verify is critical and names the reason', { skip }, async (t) => {
  const certs = makeCa();
  const ctx = testContext({ env: wildcard });
  const stranger = await serve(t, certs.issue(90, ['nil.test', '*.nil.test'], { selfSigned: true }));
  const results = await checkCertificates(ctx, { port: stranger.port, ca: certs.ca });
  assert.ok(results.every((r) => r.error === 'DEPTH_ZERO_SELF_SIGNED_CERT'));
  assert.equal(ctx.alerts[0].event, 'tls.certificate_invalid');
  assert.equal(ctx.alerts[0].severity, 'critical');
  assert.match(ctx.alerts[0].message, /nil\.test \(DEPTH_ZERO_SELF_SIGNED_CERT\)/);

  // a valid certificate for other names is no certificate for this one
  const other = await serve(t, certs.issue(90, ['other.test']));
  const mismatch = await checkCertificates(testContext({ env: wildcard }), { port: other.port, ca: certs.ca });
  assert.ok(mismatch.every((r) => r.error === 'ERR_TLS_CERT_ALTNAME_INVALID'));
});

test('with on-demand certificates only the sign-up host is checked, and 0 days turns the check off', { skip }, async (t) => {
  const certs = makeCa();
  const { port, seen } = await serve(t, certs.issue(90, ['nil.test']));
  const results = await checkCertificates(testContext({ env: { CLOUD_CERT_CHECK_ADDRESS: '127.0.0.1' } }), { port, ca: certs.ca });
  assert.deepEqual(results.map((r) => r.name), ['nil.test']);
  assert.deepEqual(await checkCertificates(testContext({ env: { ...wildcard, CLOUD_CERT_WARN_DAYS: '0' } }), { port, ca: certs.ca }), []);
  assert.deepEqual(seen, ['nil.test'], 'switched off, it doesn’t even connect');
});
