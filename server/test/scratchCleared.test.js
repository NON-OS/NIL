import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bootProcess from './helpers/bootProcess.js';

// A capsule export or restore cut off by a crash leaves a plaintext copy of the database in its
// scratch folder. The next start clears it.
test('a restart clears the scratch folders a crashed export or restore left behind', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-scratch-'));
  try {
    for (const name of ['capsule-Ab12Cd', 'restore-Ef34Gh/out']) {
      fs.mkdirSync(path.join(dir, name), { recursive: true });
      fs.writeFileSync(path.join(dir, name, 'nonos.db'), 'plaintext copy of every task');
    }
    fs.writeFileSync(path.join(dir, 'capsule-notes.txt'), 'not a scratch folder');
    const server = await bootProcess({ dataDir: dir });
    try {
      assert.ok(server.base, server.stderr());
      const left = fs.readdirSync(dir).filter((n) => /^(capsule|restore)-/.test(n));
      assert.deepEqual(left, ['capsule-notes.txt']);
    } finally {
      await server.stop();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
