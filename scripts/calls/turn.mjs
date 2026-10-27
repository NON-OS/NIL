// Runs coturn on this machine with deploy/coturn/turnserver.conf, the way the calls profile
// does, but on this machine's own network address without TLS, and allowed to relay to that
// address since both browsers sit here. Browsers don't use loopback for calls, so 127.0.0.1 is
// only the last resort. Returns null when coturn isn't installed.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

const address = () => Object.values(os.networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal)?.address ?? '127.0.0.1';

export default function turn({ port = 34780 } = {}) {
  if (spawnSync('turnserver', ['--version']).error) return null;
  const ip = address();
  const secret = crypto.randomBytes(32).toString('hex');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-turn-'));
  const conf = path.join(dir, 'turnserver.conf');
  const local = ['realm=nil.test', `listening-ip=${ip}`, `relay-ip=${ip}`, `listening-port=${port}`, `allowed-peer-ip=${ip}`, 'no-tls', 'no-stdout-log', `log-file=${path.join(dir, 'turn.log')}`];
  fs.writeFileSync(conf, `${fs.readFileSync(path.join(ROOT, 'deploy/coturn/turnserver.conf'), 'utf8')}\nstatic-auth-secret=${secret}\n${local.join('\n')}\n`, { mode: 0o600 });
  let child = null;
  const relay = {
    url: `turn:${ip}:${port}?transport=udp`,
    secret,
    log: () => fs.readFileSync(path.join(dir, 'turn.log'), 'utf8'),
    async start() {
      child = spawn('turnserver', ['-c', conf], { stdio: 'ignore' });
      await new Promise((r) => setTimeout(r, 800));
    },
    // a hard stop, the way a relay or a network goes away
    kill() {
      child?.kill('SIGKILL');
      child = null;
    },
    stop() {
      relay.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  return relay;
}
