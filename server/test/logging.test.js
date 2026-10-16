import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG = new URL('../lib/log.js', import.meta.url).href;
const KEY = 'sk-test-0123456789abcdef';
const RPC = 'https://mainnet.example.org/v3/0123456789abcdef';

// The logger reads its settings once, at import, so each case runs in its own process.
function logOnce(env, statement) {
  const script = `const { default: log } = await import(${JSON.stringify(LOG)}); ${statement}`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
}

test('secrets from the environment never reach a log line', () => {
  const statement = `log.error('ai', 'Request failed.', new Error('401 for key ${KEY} via ${RPC} and https://user:hunter22@proxy.example.org/'));`;
  for (const format of ['text', 'json']) {
    const { stderr } = logOnce({ ANTHROPIC_API_KEY: KEY, NOX_RPC_URL: RPC, LOG_FORMAT: format }, statement);
    assert.ok(stderr.includes('Request failed.'), stderr);
    for (const secret of [KEY, RPC, 'hunter22']) assert.ok(!stderr.includes(secret), `${format}: ${secret}`);
    assert.ok(stderr.includes('[redacted]'));
  }
});

test('lines carry a timestamp and a level, and info goes to stdout', () => {
  const run = logOnce({}, "log.info('server', 'Up.'); log.warn('payments', 'Slow node.', new Error('timeout'));");
  assert.match(run.stdout, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z INFO {2}\[server\] Up\.\n$/);
  assert.match(run.stderr, /^\S+Z WARN {2}\[payments\] Slow node\.: timeout\n$/);

  const json = logOnce({ LOG_FORMAT: 'json' }, "log.error('jobs', 'The purge job failed.', Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }));");
  const line = JSON.parse(json.stderr);
  assert.deepEqual([line.level, line.scope, line.message, line.error, line.code], ['error', 'jobs', 'The purge job failed.', 'database is locked', 'SQLITE_BUSY']);
  assert.match(line.stack, /database is locked/);
});

// console.* skips the redaction and LOG_FORMAT=json, so the server only logs through log.js.
test('server code logs through lib/log.js, never console', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test' && entry.name !== 'node_modules') walk(full);
      } else if (entry.name.endsWith('.js') && /\bconsole\.(log|info|warn|error|debug)\(/.test(fs.readFileSync(full, 'utf8'))) {
        offenders.push(path.relative(root, full));
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
