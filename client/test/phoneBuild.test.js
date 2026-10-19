import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The web build has to be byte for byte the same on every server, so the release hash can't
// depend on a server's project ID: the app reads phone wallet settings when it starts, and
// WalletConnect's client loads only when someone uses it.
const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'client/src');
const files = fs.readdirSync(SRC, { recursive: true }).filter((f) => /\.tsx?$/.test(f));
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('nothing in the web build reads a project ID or a WalletConnect setting at build time', () => {
  for (const f of files) {
    const text = code(f);
    assert.ok(!/WALLETCONNECT|VITE_/.test(text), `${f} names a build-time setting`);
    for (const use of text.match(/import\.meta\.env\.\w+/g) ?? []) assert.equal(use, 'import.meta.env.PROD', `${f} reads ${use}`);
  }
  assert.ok(!/WALLETCONNECT|define\s*:/.test(fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8')));
});

test('WalletConnect’s client is only ever loaded on demand', () => {
  const statically = files.filter((f) => /^\s*import[^;]*from\s+['"]@walletconnect\//m.test(read(f)));
  assert.deepEqual(statically, [path.join('lib', 'phone', 'createSignClient.ts')]);
  const importers = files.filter((f) => /from\s+['"][./]*createSignClient['"]/.test(read(f)));
  assert.deepEqual(importers, []);
  assert.match(read(path.join('lib', 'phone', 'phoneWallet.ts')), /import\('\.\/createSignClient'\)/);
  // the wrapper loads with the client too, so the app's first load carries only the small state
  assert.deepEqual(files.filter((f) => /from\s+['"][./]*createPhoneProvider['"]/.test(code(f).replace(/import type[^;]*;/g, ''))), []);
});
