import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import './helpers/fakeBrowser.js';

const MessageText = (await import('../src/components/chat/MessageText.tsx')).default;
const ChatFileView = (await import('../src/components/chat/ChatFileView.tsx')).default;
const chatContent = (await import('../src/lib/chatContent.ts')).default;

// What another member can put into a message: words, file names and types. All of it comes out
// of a decrypted message that member wrote, so it's shown as text and nothing in it runs.
const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  '"><img src=x onerror=alert(1)>',
  "'><svg onload=alert(1)>",
  '<a href="javascript:alert(1)">x</a>',
  'javascript:alert(1)',
  'https://example.com/"onmouseover="alert(1)',
  'https://example.com/<script>alert(1)</script>',
  '<iframe srcdoc="<script>alert(1)</script>">',
  '@<img src=x onerror=alert(1)>',
];
const people = [{ id: 'u1', name: '<b onclick=alert(1)>Mallory</b>' }];
// every element in the output is one of the few the components draw, none with a handler
const ALLOWED = new Set(['div', 'span', 'a', 'button', 'small', 'svg', 'path', 'rect', 'line', 'polyline', 'circle']);
const runs = (html) =>
  [...html.matchAll(/<\/?([a-z0-9-]+)([^>]*)>/gi)].some(([, tag, attrs]) => !ALLOWED.has(tag.toLowerCase()) || /\son\w+\s*=/i.test(attrs.replace(/"[^"]*"/g, '""')) || /href="\s*javascript:/i.test(attrs));

test('message text renders as text: no tags, no handlers, only http(s) links', () => {
  for (const text of PAYLOADS) {
    const html = renderToStaticMarkup(createElement(MessageText, { text: `hi ${text} @${people[0].name}`, people, me: 'u2' }));
    assert.ok(!runs(html), `${text} rendered as ${html}`);
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) assert.match(href, /^https?:\/\/[^"<>\s]+$/);
  }
  const linked = renderToStaticMarkup(createElement(MessageText, { text: 'see https://example.com/a?b=1.', people: [], me: 'u2' }));
  assert.match(linked, /<a href="https:\/\/example.com\/a\?b=1" target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">/);
});

test('file names and types from a message are cleaned and shown as text', () => {
  const key = 'A'.repeat(43);
  const content = chatContent.parse(JSON.stringify({ text: 'x', files: PAYLOADS.map((name, i) => ({ id: `${'f'.repeat(21)}${i % 10}`, name: `../../${name}\u0000\r\n.txt`, type: 'text/html; <script>', size: 5, hash: key, key })).slice(0, 10) }));
  for (const file of content.files) {
    assert.ok(!/[\\/\u0000-\u001f"]/.test(file.name), file.name);
    assert.equal(file.type, 'text/html');
    const html = renderToStaticMarkup(createElement(ChatFileView, { channelId: 'c', file }));
    assert.ok(!runs(html), html);
  }
  // a name can't hide its real ending by turning round which way it reads
  const turned = chatContent.parse(JSON.stringify({ files: [{ id: 'f'.repeat(22), name: 'invoice\u202Efdp.exe', type: 'application/octet-stream', size: 1, hash: key, key }] }));
  assert.equal(turned.files[0].name, 'invoicefdp.exe');
  // a file that isn't shaped like one makes the whole message unreadable rather than half-shown
  assert.throws(() => chatContent.parse(JSON.stringify({ files: [{ id: '<script>', name: 'x', hash: key, key, size: 1 }] })));
});

test('a message’s parts are cut to size', () => {
  const big = chatContent.parse(JSON.stringify({ text: 'a'.repeat(50_000), mentions: Array.from({ length: 500 }, (_, i) => `u${i}`), emoji: 'x'.repeat(100), target: 'nope' }));
  assert.equal(big.text.length, chatContent.limits.text);
  assert.equal(big.mentions.length, chatContent.limits.mentions);
  assert.deepEqual([big.emoji, big.target], [null, null]);
});
