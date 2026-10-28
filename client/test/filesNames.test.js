import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const load = (path) => import(`../src/${path}`).then((m) => m.default);
const ItemTile = await load('components/files/ItemTile.tsx');
const ItemRow = await load('components/files/ItemRow.tsx');
const previewKind = await load('lib/previewKind.ts');
const fileMeta = await load('lib/fileMeta.ts');
const folderLabel = await load('lib/folderLabel.ts');
const stripBidi = await load('lib/stripBidi.ts');

// Names another key holder wrote, the way an attacker would write them. They're signed, so they
// come from a teammate's browser, but nothing stops a teammate from typing markup.
const NAMES = ['<img src=x onerror=alert(1)>.pdf', '"><script>alert(1)</script>', '<svg/onload=alert(1)>.svg', "'><iframe src=javascript:alert(1)>", '<a href="javascript:alert(1)">click</a>.txt', '{{constructor.constructor("alert(1)")()}}'];

const folder = { id: 'f', name: 'F', version: 1, keyRev: 1, audience: 'team', readers: [], createdBy: 'v', updatedBy: 'v', createdAt: 1, updatedAt: 1, warning: null, oldKey: null, keyHash: 'k' };
const handlers = { canWrite: true, canDelete: () => true, selecting: false, selected: () => false, onSelect() {}, tabbable: () => true, dropTarget: null, onAction() {}, onFocus() {}, onClick() {}, drag: () => ({ draggable: true }) };
const item = (name, kind = 'file') => ({ id: 'i', folderId: 'f', parentId: null, kind, keyWrap: 'w', name, type: 'application/pdf', size: 10, width: null, height: null, hash: 'h', blob: null, thumb: null, edit: 0, by: 'v', createdBy: 'v', createdAt: 1, updatedAt: 1, locked: false, rollback: false, oldKey: null });

test('file and folder names render as text, never as markup', () => {
  for (const raw of NAMES) {
    for (const [name, kind] of [[fileMeta(raw, 'application/pdf').name, 'file'], [folderLabel(raw), 'folder']]) {
      const html = renderToStaticMarkup(createElement('table', null, createElement('tbody', null, createElement(ItemRow, { folder, item: item(name, kind), signer: raw, handlers })))) + renderToStaticMarkup(createElement(ItemTile, { folder, item: item(name, kind), handlers }));
      // the icons are the only elements drawn; the name is only ever escaped text
      assert.doesNotMatch(html, /<(script|img|iframe|a)\b/i, `${raw} rendered as markup`);
      if (/[<>"]/.test(name)) assert.equal(html.includes(name), false, `${raw} reached the page unescaped`);
    }
  }
});

test('direction marks that disguise a name are stripped', () => {
  const spoof = `invoice${String.fromCharCode(0x202e)}fdp.exe`;
  assert.equal(stripBidi(spoof), 'invoicefdp.exe');
  assert.equal(folderLabel(`${String.fromCharCode(0x2067)}Board${String.fromCharCode(0x2069)}`), 'Board');
  assert.equal(folderLabel(`  ${String.fromCharCode(7)}  `), 'Untitled folder');
});

test('SVG is never shown as an image, and HTML is only ever shown as text', () => {
  assert.equal(previewKind('image/svg+xml', 'logo.svg'), 'none');
  assert.equal(previewKind('application/octet-stream', 'logo.svg'), 'none');
  assert.equal(previewKind('image/png', 'x.svg'), 'image');
  assert.equal(previewKind('text/html', 'page.html'), 'text');
  assert.equal(previewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx'), 'docx');
  assert.equal(previewKind('application/x-msdownload', 'setup.exe'), 'none');
});
