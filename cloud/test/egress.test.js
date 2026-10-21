import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import egressConfig from '../egress/egressConfig.js';
import createEgressProxy from '../egress/createEgressProxy.js';

const NAMES = { 'public.test': '93.184.216.34', 'inside.test': '127.0.0.1', 'meta.test': '169.254.169.254', 'docker.test': '172.18.0.5' };
const resolve = async (host) => {
  if (!NAMES[host]) throw new Error('ENOTFOUND');
  return [{ address: NAMES[host], family: 4 }];
};

let echo;
const proxies = [];
before(async () => {
  echo = net.createServer((socket) => socket.pipe(socket));
  await new Promise((done) => echo.listen(0, '127.0.0.1', done));
});
after(() => {
  echo.close();
  for (const p of proxies) p.close();
});

// A proxy whose every allowed connection lands on the local echo server, recording where it
// was told to go, and whose log lines are kept.
async function start(env = {}) {
  const { config, errors } = egressConfig(env);
  assert.deepEqual(errors, []);
  const lines = [];
  const dialled = [];
  const log = { info: (event, fields) => lines.push({ event, ...fields }), warn: (event, fields) => lines.push({ event, ...fields }) };
  const connect = (opts) => {
    dialled.push(opts);
    return net.connect(echo.address().port, '127.0.0.1');
  };
  const server = createEgressProxy(config, { log, resolve, connect });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  proxies.push(server);
  return { port: server.address().port, lines, dialled };
}

// Sends one request line to the proxy and resolves with the status and the open socket.
function ask(port, firstLine, { auth = 'ws1:' } = {}) {
  return new Promise((done, fail) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(`${firstLine}\r\nHost: x\r\nProxy-Authorization: Basic ${Buffer.from(auth).toString('base64')}\r\n\r\n`);
    });
    let head = '';
    const onData = (chunk) => {
      head += chunk.toString('latin1');
      if (!head.includes('\r\n\r\n')) return;
      socket.off('data', onData);
      done({ status: Number(head.split(' ')[1]), socket });
    };
    socket.on('data', onData);
    socket.on('error', fail);
    // a request the HTTP parser rejects is simply dropped
    socket.on('close', () => done({ status: 0, socket }));
  });
}

const closed = (socket) => new Promise((done) => (socket.destroyed ? done() : socket.once('close', done)));

test('a tunnel to a public name on 443 goes to the address the proxy checked, and is logged without content', async () => {
  const { port, lines, dialled } = await start();
  const { status, socket } = await ask(port, 'CONNECT public.test:443 HTTP/1.1');
  assert.equal(status, 200);
  assert.deepEqual(dialled.map((d) => [d.host, d.port]), [['93.184.216.34', 443]]);
  socket.write('ping');
  const back = await new Promise((done) => socket.once('data', (d) => done(d.toString())));
  assert.equal(back, 'ping');
  socket.end();
  await closed(socket);
  await new Promise((done) => setTimeout(done, 50));
  const line = lines.find((l) => l.event === 'egress.closed');
  assert.deepEqual({ ...line, ms: undefined }, { event: 'egress.closed', workspace: 'ws1', host: 'public.test', port: 443, up: 4, down: 4, ms: undefined });
});

test('private, loopback, metadata and Docker addresses, other ports and the deny list are refused', async () => {
  const { port, dialled } = await start({ CLOUD_EGRESS_PROXY_DENY: '93.184.216.0/24' });
  for (const line of ['CONNECT public.test:22 HTTP/1.1', 'CONNECT 10.0.0.1:443 HTTP/1.1', 'CONNECT 169.254.169.254:443 HTTP/1.1', 'CONNECT inside.test:443 HTTP/1.1', 'CONNECT meta.test:443 HTTP/1.1', 'CONNECT docker.test:443 HTTP/1.1', 'CONNECT [::1]:443 HTTP/1.1', 'CONNECT [::ffff:127.0.0.1]:443 HTTP/1.1', 'CONNECT public.test:443 HTTP/1.1', 'CONNECT nowhere.test:443 HTTP/1.1']) {
    const { status, socket } = await ask(port, line);
    assert.equal(status, 403, line);
    socket.destroy();
  }
  assert.equal(dialled.length, 0, 'nothing refused was ever dialled');
  const odd = await ask(port, 'CONNECT public.test HTTP/1.1');
  assert.equal(odd.status, 400, 'a target without a port');
  odd.socket.destroy();
  const garbled = await ask(port, 'CONNECT not a target HTTP/1.1');
  assert.equal(garbled.status, 0);
  const plain = await ask(port, 'GET http://public.test/ HTTP/1.1');
  assert.equal(plain.status, 405);
  plain.socket.destroy();
});

test('each source has a rate and a cap on open tunnels', async () => {
  const fast = await start({ CLOUD_EGRESS_PROXY_PER_MINUTE: '2' });
  const opened = [];
  for (let i = 0; i < 2; i++) {
    const { status, socket } = await ask(fast.port, 'CONNECT public.test:443 HTTP/1.1');
    assert.equal(status, 200);
    opened.push(socket);
  }
  const third = await ask(fast.port, 'CONNECT public.test:443 HTTP/1.1');
  assert.equal(third.status, 429);
  for (const s of [...opened, third.socket]) s.destroy();

  const narrow = await start({ CLOUD_EGRESS_PROXY_CONCURRENT: '1' });
  const first = await ask(narrow.port, 'CONNECT public.test:443 HTTP/1.1');
  assert.equal(first.status, 200);
  const second = await ask(narrow.port, 'CONNECT public.test:443 HTTP/1.1');
  assert.equal(second.status, 429);
  second.socket.destroy();
  first.socket.destroy();
  await closed(first.socket);
  await new Promise((done) => setTimeout(done, 50));
  const again = await ask(narrow.port, 'CONNECT public.test:443 HTTP/1.1');
  assert.equal(again.status, 200, 'a closed tunnel frees its place');
  again.socket.destroy();
});

test('the proxy judges addresses by exactly the same rules as the app', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const own = fs.readFileSync(path.join(here, '..', 'egress', 'addressCategory.js'), 'utf8');
  const app = fs.readFileSync(path.join(here, '..', '..', 'server', 'agents', 'net', 'addressCategory.js'), 'utf8');
  assert.equal(own, app, 'cloud/egress/addressCategory.js is a copy of server/agents/net/addressCategory.js; change both');
});
