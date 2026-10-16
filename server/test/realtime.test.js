import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import startServer from './helpers/startServer.js';

let srv;

before(async () => {
  srv = await startServer();
});
after(() => srv.close());

// What a raw client gets back for one upgrade request.
function upgrade(target) {
  const { port } = new URL(srv.base);
  return new Promise((resolve, reject) => {
    const socket = net.connect(Number(port), '127.0.0.1', () => {
      socket.write([`GET ${target} HTTP/1.1`, `Host: 127.0.0.1:${port}`, 'Connection: Upgrade', 'Upgrade: websocket', 'Sec-WebSocket-Version: 13', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', '', ''].join('\r\n'));
    });
    let reply = '';
    socket.on('data', (chunk) => (reply += chunk));
    socket.on('close', () => resolve(reply.split('\r\n')[0]));
    socket.on('error', reject);
  });
}

test('a handshake that breaks the handler is refused, and the server carries on', async () => {
  // an absolute target the URL parser rejects used to throw out of the upgrade handler
  assert.equal(await upgrade('http://[broken/ws'), 'HTTP/1.1 500 Internal Server Error');
  assert.equal(await upgrade('/ws'), 'HTTP/1.1 401 Unauthorized');
  assert.equal((await fetch(`${srv.base}/healthz`)).status, 200);
});
