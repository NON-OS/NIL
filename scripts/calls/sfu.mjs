// Runs LiveKit on this machine for the calls check, from the binary LIVEKIT_SERVER points at (the
// one in the image docker-compose.yml runs), with deploy/livekit/livekit.yaml's settings on this
// machine's network address. Returns null when LIVEKIT_SERVER isn't set.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const address = () => Object.values(os.networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal)?.address ?? '127.0.0.1';

export default async function sfu({ port = 7880 } = {}) {
  const bin = process.env.LIVEKIT_SERVER;
  if (!bin || !fs.existsSync(bin)) return null;
  const ip = address();
  const key = 'nilcheck';
  const secret = crypto.randomBytes(32).toString('hex');
  const config = [`port: ${port}`, 'bind_addresses:', `  - ${ip}`, 'rtc:', '  tcp_port: 7881', '  port_range_start: 50000', '  port_range_end: 50200', `  node_ip: ${ip}`, 'turn:', '  enabled: false', 'room:', '  auto_create: true', '  empty_timeout: 60', 'logging:', '  level: info'].join('\n');
  const child = spawn(bin, ['--config-body', config, '--keys', `${key}: ${secret}`], { stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  child.stderr.on('data', (c) => (log += c));
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://${ip}:${port}/`).then(() => true, () => false)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return { env: { SFU_URL: `ws://${ip}:${port}`, SFU_API_KEY: key, SFU_API_SECRET: secret }, log: () => log, stop: () => child.kill() };
}
