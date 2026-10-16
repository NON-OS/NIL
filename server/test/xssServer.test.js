import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import csvCell from '../lib/csvCell.js';
import icsLine from '../calendar/icsLine.js';

// What the server hands back when people type markup and control characters into titles,
// descriptions, comments and names: JSON only, never HTML; files that can't run on our origin;
// spreadsheet cells that don't run as formulas; calendar lines that can't add their own fields.
let srv;
const base = () => srv.base;
const owner = client(base);
const ids = {};
const XSS = '<script>alert(1)</script><img src=x onerror=alert(1)>';
const CRLF = 'Standup\r\nATTACH:https://evil.example/x\r\nEND:VEVENT\nBEGIN:VALARM';

before(async () => {
  srv = await startServer();
  await owner.wallet(wallet(), 'setup', { name: `Olivia ${XSS}`, workspaceName: `Acme ${XSS}` });
  ids.project = (await owner('POST', '/api/projects', { name: `Board ${XSS}` })).data.project.id;
  ids.task = (await owner('POST', '/api/tasks', { title: `=HYPERLINK("https://evil.example") ${XSS}`, description: `[x](javascript:alert(1)) ${XSS}`, projectId: ids.project })).data.task;
});
after(() => srv.close());

const isJson = (res) => /^application\/json/.test(res.headers.get('content-type'));

test('a share page carries people’s text as JSON data the browser never parses as HTML', async () => {
  await owner('PUT', '/api/sharing', { shareLinks: true });
  const made = await owner('POST', '/api/share-links', { kind: 'task', targetId: ids.task.id, days: 7 });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const page = await fetch(`${base()}/api/public/share/${made.data.token}`);
  assert.ok(isJson(page));
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  const view = await page.json();
  assert.ok(view.task.title.includes('<script>'), 'kept as text, for React to escape');
  // a token made of markup comes back as a JSON 404, not as a page that echoes it
  const probe = await fetch(`${base()}/api/public/share/${encodeURIComponent(XSS)}`);
  assert.equal(probe.status, 404);
  assert.ok(isJson(probe));
});

test('an uploaded page or picture with script in it downloads, sandboxed, instead of rendering', async () => {
  const upload = (bytes, type, name) =>
    fetch(`${base()}/api/tasks/${ids.task.id}/attachments`, { method: 'POST', headers: { Cookie: owner.cookie(), 'X-NONOS': '1', 'Content-Type': type, 'X-Filename': encodeURIComponent(name) }, body: Buffer.from(bytes) }).then((r) => r.json());
  const files = [
    ['<html><script>alert(1)</script></html>', 'text/html', 'page.html'],
    ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', 'image/svg+xml', 'logo.svg'],
    ['<?xml version="1.0"?><x:script xmlns:x="http://www.w3.org/1999/xhtml">alert(1)</x:script>', 'application/xhtml+xml', 'a.xhtml'],
    // a GIF header in front of a script: a polyglot that is both
    ['GIF89a/*<script>alert(1)</script>*/', 'text/javascript', 'x.js'],
    ['%PDF-1.4 <script>alert(1)</script>', 'text/html; charset=utf-8', 'x.pdf.html'],
  ];
  for (const [bytes, type, name] of files) {
    const { attachment } = await upload(bytes, type, name);
    const res = await fetch(`${base()}/api/attachments/${attachment.id}`, { headers: { Cookie: owner.cookie() } });
    assert.equal(res.headers.get('content-type'), 'application/octet-stream', name);
    assert.match(res.headers.get('content-disposition'), /^attachment;/, name);
    assert.match(res.headers.get('content-security-policy'), /sandbox/, name);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', name);
  }
  // an image that claims to be a PNG may show inline, but sandboxed and never sniffed as HTML
  const { attachment } = await upload('<script>alert(1)</script>', 'image/png', 'fake.png');
  const res = await fetch(`${base()}/api/attachments/${attachment.id}`, { headers: { Cookie: owner.cookie() } });
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'.*sandbox/);
});

test('a file name can’t break out of its Content-Disposition header', async () => {
  const name = 'a";\r\nSet-Cookie: x=1;\r\n\r\n<script>.html';
  const up = await fetch(`${base()}/api/tasks/${ids.task.id}/attachments`, { method: 'POST', headers: { Cookie: owner.cookie(), 'X-NONOS': '1', 'Content-Type': 'text/plain', 'X-Filename': encodeURIComponent(name) }, body: Buffer.from('hi') });
  const { attachment } = await up.json();
  const res = await fetch(`${base()}/api/attachments/${attachment.id}`, { headers: { Cookie: owner.cookie() } });
  assert.equal(res.headers.get('set-cookie'), null);
  assert.match(res.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''[A-Za-z0-9%._~!'()*-]+$/);
});

test('spreadsheet cells never start with something a spreadsheet runs', () => {
  const formulas = ['=1+1', '+1+1', '-1+1', '@SUM(A1)', '\t=1', '\r=1', '=HYPERLINK("https://evil.example","x")', "=cmd|' /C calc'!A0", '-2+3+cmd|\' /C calc\'!A0'];
  for (const value of formulas) {
    const cell = csvCell(value);
    const content = cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;
    assert.equal(content[0], "'", `${JSON.stringify(value)} became ${JSON.stringify(cell)}`);
  }
  // a quote or line break inside a cell stays inside it
  assert.equal(csvCell('a"b\nc,d'), '"a""b\nc,d"');
});

test('the task export keeps a formula title from running', async () => {
  const csv = (await owner('GET', '/api/export/tasks.csv')).data;
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"https://evil.example\"\")"));
});

test('a calendar title can’t add its own lines to the feed', async () => {
  const lines = icsLine('SUMMARY', CRLF, { text: true }).split('\r\n');
  assert.ok(lines[0].startsWith('SUMMARY:'));
  for (const line of lines.slice(1)) assert.ok(line.startsWith(' '), `folded line ${JSON.stringify(line)}`);
  assert.equal(/[\r\n]/.test(lines.join('')), false);

  await owner('POST', '/api/tasks', { title: CRLF, projectId: ids.project, dueDate: '2030-01-02' });
  const { url } = (await owner('POST', '/api/me/calendar-feed')).data.feed;
  const ics = await (await fetch(`${base()}${new URL(url).pathname}`)).text();
  const fields = ics.split('\r\n').filter((l) => !l.startsWith(' '));
  assert.equal(fields.filter((l) => l.startsWith('BEGIN:VEVENT')).length, fields.filter((l) => l.startsWith('END:VEVENT')).length);
  assert.equal(fields.some((l) => /^(ATTACH|BEGIN:VALARM)/.test(l)), false, ics);
});
