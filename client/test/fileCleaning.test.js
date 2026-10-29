import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Document, Packer, Paragraph } from 'docx';
import mammoth from 'mammoth';
import './helpers/fakeBrowser.js';

const load = (path) => import(`../src/${path}.ts`).then((m) => m.default);
const cleanFile = await load('lib/cleanFile');
const zipStored = await load('lib/docConvert/zipStored');
const zipCheck = await load('lib/zipCheck');

const enc = (s) => new TextEncoder().encode(s);
const segment = (marker, data) => [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff, ...data];

// A tiny JPEG: start, an Exif segment naming a GPS position, a frame header of 640x480, a scan.
function photo() {
  const exif = [...enc('Exif\0\0'), ...enc('GPS 59.3293N 18.0686E')];
  const frame = [8, 0x01, 0xe0, 0x02, 0x80, 1, 1, 0x11, 0];
  return new Uint8Array([0xff, 0xd8, ...segment(0xe1, exif), ...segment(0xc0, frame), ...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x12, 0x34, 0xff, 0xd9]);
}

test('a photo loses its location byte by byte, and the picture itself is left as it was', async () => {
  const before = photo();
  const clean = await cleanFile(new File([before], 'IMG_0001.JPG', { type: 'image/jpeg' }));
  const after = new Uint8Array(await clean.body.arrayBuffer());
  assert.equal(clean.mime, 'image/jpeg');
  assert.deepEqual([clean.width, clean.height], [640, 480]);
  assert.ok(!new TextDecoder().decode(after).includes('GPS'));
  // the scan and everything after it are the very same bytes
  const scan = (b) => b.subarray(b.indexOf(0xda) - 1);
  assert.deepEqual([...scan(after)], [...scan(before)]);
});

test('a Word file loses who wrote it and the company it came from, and still opens', async () => {
  const core = '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:creator>Erik Lind</dc:creator><cp:lastModifiedBy>Erik Lind</cp:lastModifiedBy></cp:coreProperties>';
  const app = '<Properties><Company>NONOS AB</Company><Template>Secret.dotx</Template></Properties>';
  const docx = zipStored([
    { name: '[Content_Types].xml', bytes: enc('<Types/>') },
    { name: 'word/document.xml', bytes: enc('<w:document>the words</w:document>') },
    { name: 'docProps/core.xml', bytes: enc(core) },
    { name: 'docProps/app.xml', bytes: enc(app) },
  ]);
  const clean = await cleanFile(new File([docx], 'Plan.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const out = new Uint8Array(await clean.body.arrayBuffer());
  const text = new TextDecoder().decode(out);
  for (const leaked of ['Erik Lind', 'NONOS AB', 'Secret.dotx']) assert.ok(!text.includes(leaked), leaked);
  assert.ok(text.includes('<w:document>the words</w:document>'));
  await zipCheck(out, { maxEntries: 10, maxBytes: 1e6, message: 'not a zip' });
});

test('a real Word file still opens after cleaning, without its author', async () => {
  const doc = new Document({ creator: 'Erik Lind', lastModifiedBy: 'Erik Lind', sections: [{ children: [new Paragraph('Quarterly plan')] }] });
  const clean = await cleanFile(new File([await Packer.toBuffer(doc)], 'p.docx'));
  const out = Buffer.from(await clean.body.arrayBuffer());
  assert.ok(!out.toString('latin1').includes('Erik Lind'));
  assert.match((await mammoth.convertToHtml({ buffer: out })).value, /Quarterly plan/);
});

test('other files go as they are', async () => {
  const pdf = new File(['%PDF-1.7 hello'], 'a.pdf', { type: 'application/pdf' });
  assert.equal(await (await cleanFile(pdf)).body.text(), '%PDF-1.7 hello');
});
