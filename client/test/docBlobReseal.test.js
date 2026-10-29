import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { store, entry, person, signIn, route, reset, sent } from './helpers/fakeBrowser.js';
import { state, serveFiles } from './helpers/fakeFiles.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const sealedBlobs = await load('actions/sealedBlobs');
const docBlobReseal = await load('actions/liveDoc/docBlobReseal');

const users = [{ id: 'v', name: 'Vic' }];

beforeEach(() => {
  reset();
  const V = person();
  signIn('v', V, users);
  route('GET', '/api/encryption-keys', () => [entry('v', V)]);
  serveFiles(() => store.get().me.id);
});

test('a doc’s picture is encrypted again under a fresh key, the doc points at the copy, and the old one goes', async () => {
  const ref = await sealedBlobs.upload(new Blob(['a picture’s bytes'], { type: 'application/octet-stream' }), { scope: { kind: 'doc', id: 'doc-1' } });
  const ydoc = new Y.Doc();
  const img = new Y.XmlElement('sealedImage');
  img.setAttribute('blob', ref.blob);
  img.setAttribute('key', ref.key);
  img.setAttribute('mime', 'image/png');
  ydoc.getXmlFragment('body').push([img]);
  const live = { ydoc, pending: () => false, status: () => ({ state: 'saved', refused: 0 }) };

  await docBlobReseal(live, { id: 'doc-1', reseal: { waiting: [ref.blob], copies: [] } });
  const copy = img.getAttribute('blob');
  assert.notEqual(copy, ref.blob);
  assert.notEqual(img.getAttribute('key'), ref.key);
  assert.ok(!state.blobs.has(ref.blob), 'the old copy was let go');
  assert.ok(sent.some((r) => r.url === `/api/blobs/${copy}/adopt`));
  const back = await sealedBlobs.read({ blob: copy, key: img.getAttribute('key'), mime: 'image/png' });
  assert.equal(await back.text(), 'a picture’s bytes');
});
