import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import startServer from './helpers/startServer.js';
import SETUP_TOKEN from './helpers/setupToken.js';

// A restore keeps the upload and its unpacked copy on disk until it's done, on a disk other
// workspaces may share, so it's refused up front when there isn't room for twice the capsule.
let srv;

before(async () => {
  // a capsule limit far beyond any real disk, so only the free-space check can refuse
  srv = await startServer({ env: { MAX_CAPSULE_MB: String(4 * 1024 ** 3) } });
});
after(() => srv.close());

function restoreDeclaring(bytes) {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(srv.base);
    const req = http.request(
      {
        hostname,
        port,
        method: 'POST',
        path: '/api/auth/restore',
        headers: {
          'X-NONOS': '1',
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(bytes),
          'X-Setup-Token': SETUP_TOKEN,
          'X-Capsule-Passphrase': Buffer.from('a long enough passphrase').toString('base64'),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          req.destroy();
          resolve({ status: res.statusCode, data: JSON.parse(text) });
        });
      },
    );
    req.on('error', reject);
    req.write(Buffer.alloc(16));
  });
}

test('a capsule bigger than half the free disk is refused before any of it is stored', async () => {
  const res = await restoreDeclaring(10 ** 15);
  assert.equal(res.status, 507);
  assert.match(res.data.error, /enough free disk/);
});
