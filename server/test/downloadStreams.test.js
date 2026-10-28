import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import publishKey from './helpers/publishKey.js';

// Downloads as a careless or hostile client makes them: started and dropped by the dozen, or
// asked for after the file went missing. Neither may leave files open or take the server down.
let srv;
const base = () => srv.base;
const owner = client(base);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const openOn = (suffix) => fs.readdirSync('/proc/self/fd').filter((fd) => {
  try {
    return fs.readlinkSync(`/proc/self/fd/${fd}`).endsWith(suffix);
  } catch {
    return false;
  }
}).length;

before(async () => {
  srv = await startServer();
  const w = wallet();
  await owner.wallet(w, 'setup', { name: 'Owner', workspaceName: 'Downloads' });
  await publishKey(owner, w);
});
after(() => srv.close());

test('a download the client drops closes its file at once', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Big file' })).data.task.id;
  const up = await owner('POST', `/api/tasks/${task}/attachments`, new Uint8Array(8 * 1024 * 1024), { 'Content-Type': 'application/zip', 'X-Filename': 'a.zip' });
  const id = up.data.attachment.id;
  const url = new URL(`${base()}/api/attachments/${id}?download`);
  const reqs = Array.from({ length: 40 }, () => {
    const req = http.get({ host: url.hostname, port: url.port, path: url.pathname + url.search, headers: { Cookie: owner.cookie() } }, (res) => res.pause());
    req.on('error', () => {});
    return req;
  });
  await sleep(800);
  for (const r of reqs) r.destroy();
  await sleep(1500);
  assert.equal(openOn(`/uploads/${id}`), 0);

  // gone from the disk between the lookup and the read: an answer, not a crash
  fs.rmSync(path.join(srv.dataDir, 'uploads', id), { force: true });
  assert.equal((await owner('GET', `/api/attachments/${id}`)).status, 404);
  assert.equal((await owner('GET', '/api/auth/state')).status, 200);
});
