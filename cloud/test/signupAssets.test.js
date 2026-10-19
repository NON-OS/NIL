import { test } from 'node:test';
import assert from 'node:assert/strict';
import createSignupFlow from '../signup/createSignupFlow.js';
import createPublicServer from '../signup/http/createPublicServer.js';
import assetTag from '../signup/http/assetTag.js';
import etagMatches from '../signup/http/etagMatches.js';
import testContext from './helpers/testContext.js';

async function serve() {
  const ctx = testContext();
  const server = createPublicServer(ctx, createSignupFlow(ctx, { provision: () => {} }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('the page’s code and styles are checked again on every visit, fonts and the icon are kept for a day', async () => {
  const { base, close } = await serve();
  try {
    for (const path of ['/assets/signup.js', '/assets/signup.css']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, path);
      assert.equal(res.headers.get('cache-control'), 'no-cache', path);
      assert.match(res.headers.get('etag'), /^"[\w-]{43}"$/, path);
    }
    for (const path of ['/assets/favicon.svg', '/assets/fonts/geist.woff2', '/assets/fonts/jetbrains-mono.woff2']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.headers.get('cache-control'), 'public, max-age=86400', path);
      assert.ok(res.headers.get('etag'), path);
    }
    // the page itself is never kept
    assert.equal((await fetch(`${base}/`)).headers.get('cache-control'), 'no-store');
  } finally {
    await close();
  }
});

test('the page names its script and styles by their content, so a new release never runs an old copy', async () => {
  const { base, close } = await serve();
  try {
    const html = await (await fetch(`${base}/`)).text();
    for (const path of ['/assets/signup.js', '/assets/signup.css']) {
      const tag = (await fetch(`${base}${path}`)).headers.get('etag');
      const named = html.match(new RegExp(`${path.replace(/[./]/g, '\\$&')}\\?v=([\\w-]+)`));
      assert.ok(named, path);
      assert.equal(named[1], tag.slice(1, 17), path);
      const versioned = await fetch(`${base}${path}?v=${named[1]}`);
      assert.equal(versioned.status, 200, path);
      assert.equal(versioned.headers.get('etag'), tag, path);
    }
    const notice = await (await fetch(`${base}/unavailable`, { headers: { host: 'gone.nil.test' } })).text();
    assert.match(notice, /href="\/assets\/signup\.css\?v=[\w-]{16}"/);
  } finally {
    await close();
  }
});

test('a browser with the current copy gets a 304 and no body; one with an older copy gets the new one', async () => {
  const { base, close } = await serve();
  try {
    const first = await fetch(`${base}/assets/signup.js`);
    const etag = first.headers.get('etag');
    const body = await first.text();

    for (const header of [etag, `W/${etag}`, `"stale", ${etag}`, '*']) {
      const again = await fetch(`${base}/assets/signup.js`, { headers: { 'if-none-match': header } });
      assert.equal(again.status, 304, header);
      assert.equal(again.headers.get('etag'), etag, header);
      assert.equal(again.headers.get('cache-control'), 'no-cache', header);
      assert.equal(await again.text(), '', header);
    }

    const stale = await fetch(`${base}/assets/signup.js`, { headers: { 'if-none-match': '"an-older-release"' } });
    assert.equal(stale.status, 200);
    assert.equal(await stale.text(), body);
  } finally {
    await close();
  }
});

test('HEAD answers with the same headers and no body', async () => {
  const { base, close } = await serve();
  try {
    const get = await fetch(`${base}/assets/signup.css`);
    const head = await fetch(`${base}/assets/signup.css`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('etag'), get.headers.get('etag'));
    assert.equal(head.headers.get('content-length'), get.headers.get('content-length'));
    assert.equal(await head.text(), '');
    const matched = await fetch(`${base}/assets/signup.css`, { method: 'HEAD', headers: { 'if-none-match': get.headers.get('etag') } });
    assert.equal(matched.status, 304);
  } finally {
    await close();
  }
});

test('the ETag follows the bytes: the same file keeps it, any change gives a new one', () => {
  const tag = assetTag(Buffer.from('console.log(1);'));
  assert.equal(assetTag(Buffer.from('console.log(1);')), tag);
  assert.notEqual(assetTag(Buffer.from('console.log(2);')), tag);
  assert.equal(etagMatches(undefined, tag), false);
  assert.equal(etagMatches('', tag), false);
  assert.equal(etagMatches('"something-else"', tag), false);
});
