import './helpers/jsdomWindow.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as docx from 'docx';
import importDocx from '../src/lib/docConvert/importDocx.ts';
import exportDocx from '../src/lib/docConvert/exportDocx.ts';
import parseDocxHtml from '../src/lib/docConvert/parseDocxHtml.ts';
import docSchema from '../src/lib/docConvert/docSchema.ts';
import readZip from './helpers/readZip.js';
import { faithful, doc, para, text, heading, item, task, cell, image, PNG, PNG_WIDE } from './helpers/docSamples.js';

const normal = (json) => docSchema().nodeFromJSON(json).toJSON();
const people = (id) => ({ u1: 'Ann Lee' })[id] ?? '';
const opened = { b1: { bytes: PNG, width: 1 }, b2: { bytes: PNG_WIDE, width: 2 } };
const readImage = async (attrs) => ({ mime: 'image/png', height: 1, ...(opened[attrs.blob] ?? opened.b1) });
const uploads = [];
const onImage = async (bytes, mime, alt) => {
  const n = uploads.push({ bytes, mime, alt });
  return { blob: `blob-${n}`, key: `key-${n}`, mime, name: `upload-${n}.png`, width: 10 * n, height: 5, alt };
};
const toWord = (content, title = 'Plan', read = readImage) => exportDocx({ title, content }, { readImage: read, people });
const roundTrip = async (content, title) => importDocx(await toWord(content, title), { onImage });
const unzip = async (blob) => readZip(new Uint8Array(await blob.arrayBuffer()));
const part = async (blob, name) => new TextDecoder().decode((await unzip(blob)).get(name).bytes);
// a Word file written straight with the docx library, as Word or another app might have made it
const wordFile = (children, extra = {}) => docx.Packer.toBlob(new docx.Document({ ...extra, sections: [{ children }] }));
const kinds = (json, out = new Set()) => (out.add(json.type), (json.content ?? []).forEach((c) => kinds(c, out)), out);
const allText = (json) => (json.text ?? '') + (json.content ?? []).map(allText).join(json.type === 'paragraph' ? '' : '\n');
const hrefs = (json, out = []) => {
  for (const m of json.marks ?? []) if (m.type === 'link') out.push(m.attrs.href);
  (json.content ?? []).forEach((c) => hrefs(c, out));
  return out;
};

test('every node and mark Word can carry comes back from an export unchanged', async () => {
  assert.deepEqual(await roundTrip(faithful(), 'Quarterly plan'), { title: 'Quarterly plan', content: normal(faithful()) });
});

test('the Word file is built from Word’s own styles, so its navigation pane sees the headings', async () => {
  const file = await toWord(faithful(), 'Quarterly plan');
  assert.equal(file.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const body = await part(file, 'word/document.xml');
  const styles = await part(file, 'word/styles.xml');
  assert.match(body, /<w:pStyle w:val="Title"\/>.*?Quarterly plan/);
  for (const level of [1, 2, 3]) assert.match(body, new RegExp(`<w:pStyle w:val="Heading${level}"/><w:outlineLvl w:val="${level - 1}"/>`));
  assert.match(styles, /<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"\/>/);
  assert.match(styles, /w:styleId="Code"><w:name w:val="Code"\/>.*?w:ascii="Consolas"/s);
  assert.match(styles, /w:styleId="InlineCode"><w:name w:val="Inline Code"\/>/);
  assert.match(body, /<w:t xml:space="preserve">☐ <\/w:t>.*?Write the brief.*?<w:t xml:space="preserve">☑ <\/w:t>.*?Book the room/s);
  assert.match(body, /<w:tblHeader\/>/);
  assert.equal((body.match(/<w:tblHeader/g) ?? []).length, 1);
  assert.match(await part(file, 'docProps/core.xml'), /<dc:title>Quarterly plan<\/dc:title>/);
});

test('alignment, merged cells and images come back', async () => {
  uploads.length = 0;
  const content = doc(
    { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [text('Centred heading')] },
    { type: 'paragraph', attrs: { textAlign: 'right' }, content: [text('Right')] },
    { type: 'paragraph', attrs: { textAlign: 'justify' }, content: [text('Justified')] },
    { type: 'table', content: [
      { type: 'tableRow', content: [cell('tableHeader', para(text('A'))), cell('tableHeader', para(text('B'))), cell('tableHeader', para(text('C')))] },
      { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [para(text('Two wide'))] }, { type: 'tableCell', attrs: { rowspan: 2 }, content: [para(text('Two tall'))] }] },
      { type: 'tableRow', content: [cell('tableCell', para(text('x'))), cell('tableCell', para(text('y')))] },
    ] },
    image('b1', { alt: 'Red dot', width: 40, height: 40 }),
    { type: 'blockquote', content: [image('b2', { alt: 'Blue bar' })] },
  );
  const { content: back } = await roundTrip(content);
  assert.deepEqual(back.content.slice(0, 3).map((n) => n.attrs.textAlign), ['center', 'right', 'justify']);
  const rows = back.content[3].content;
  assert.deepEqual(rows.map((r) => r.content.map((c) => [c.type, c.attrs.colspan, c.attrs.rowspan, allText(c)])), [
    [['tableHeader', 1, 1, 'A'], ['tableHeader', 1, 1, 'B'], ['tableHeader', 1, 1, 'C']],
    [['tableCell', 2, 1, 'Two wide'], ['tableCell', 1, 2, 'Two tall']],
    [['tableCell', 1, 1, 'x'], ['tableCell', 1, 1, 'y']],
  ]);
  // each image went out through readImage and came back in through onImage, bytes and alt text intact
  assert.deepEqual(uploads.map((u) => [u.mime, u.alt]), [['image/png', 'Red dot'], ['image/png', 'Blue bar']]);
  assert.deepEqual([uploads[0].bytes, uploads[1].bytes], [PNG, PNG_WIDE]);
  assert.deepEqual({ ...back.content[4].attrs }, { blob: 'blob-1', key: 'key-1', mime: 'image/png', name: 'upload-1.png', width: 10, height: 5, alt: 'Red dot' });
  assert.deepEqual(back.content[5].content.map((n) => [n.type, n.attrs.blob]), [['sealedImage', 'blob-2']]);
  assert.doesNotMatch(JSON.stringify(back), /src|https?:|data:/);
});

test('images go out through readImage, once each, at the size the doc shows them', async () => {
  const read = [];
  const tracked = async (attrs) => (read.push(attrs.blob), readImage(attrs));
  const content = doc(image('b1', { width: 1200, height: 600 }), image('b2'), image('b1', { width: 1200, height: 600 }));
  const file = await toWord(content, 'Pictures', tracked);
  assert.deepEqual(read, ['b1', 'b2']);
  const body = await part(file, 'word/document.xml');
  // 1200×600 pixels scaled to fit the page, and the natural 2×1 for the other, in EMUs
  assert.deepEqual([...body.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [Number(m[1]) / 9525, Number(m[2]) / 9525]), [[600, 300], [2, 1], [600, 300]]);
  assert.match(body, /descr="Alt b1"/);
  // a format Word can't hold is redrawn as PNG where the browser has a canvas, and named where it hasn't
  const webp = async () => ({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/webp', width: 3, height: 2 });
  assert.match(await part(await toWord(doc(image('w')), 'x', webp), 'word/document.xml'), /<w:t xml:space="preserve">\[Image: Alt w\]<\/w:t>/);
  globalThis.createImageBitmap = async (blob) => ({ width: 3, height: 2, close() {}, from: blob.type });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      Object.assign(this, { width, height });
    }
    getContext = () => ({ drawImage() {} });
    convertToBlob = async () => new Blob([PNG], { type: 'image/png' });
  };
  try {
    const files = await unzip(await toWord(doc(image('w')), 'x', webp));
    assert.deepEqual([...files.keys()].filter((name) => /^word\/media\/./.test(name)).map((name) => files.get(name).bytes), [PNG]);
  } finally {
    delete globalThis.createImageBitmap;
    delete globalThis.OffscreenCanvas;
  }
});

test('what Word has no place for is written as text', async () => {
  const content = doc(
    para({ type: 'mention', attrs: { id: 'u1', label: 'Ann' } }, text(' and '), { type: 'mention', attrs: { id: 'gone', label: 'Old name' } }, text(' agreed.')),
    para(text('Discussed', { type: 'comment', attrs: { thread: 't1' } }), text(' in review.')),
    { type: 'sealedFile', attrs: { blob: 'f1', key: 'k', mime: 'application/pdf', name: 'Budget.pdf', size: 123456 } },
    { type: 'orderedList', attrs: { start: 4 }, content: [item(para(text('Fourth')))] },
    { type: 'codeBlock', attrs: { language: 'python' }, content: [text('print(1)')] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { align: 'center' }, content: [para(text('Mid'))] }] }] },
  );
  const { content: back } = await roundTrip(content);
  assert.deepEqual(back.content.slice(0, 3).map(allText), ['@Ann Lee and @Old name agreed.', 'Discussed in review.', 'Attached file: Budget.pdf (121 KB)']);
  assert.ok(!kinds(back).has('mention') && !JSON.stringify(back).includes('comment'));
  // Word numbers it from four, but the number doesn't come back, nor does the code's language
  assert.deepEqual([back.content[3].attrs.start, back.content[4].attrs.language], [1, null]);
  // a centred cell comes back as a centred paragraph in it
  assert.equal(back.content[5].content[0].content[0].content[0].attrs.textAlign, 'center');
  assert.match(await part(await toWord(content), 'word/numbering.xml'), /<w:start w:val="4"\/>/);
});

test('Word files from elsewhere come in by their style names and fonts', async () => {
  uploads.length = 0;
  const styles = { paragraphStyles: [{ id: 'Quote', name: 'Quote' }, { id: 'IntenseQuote', name: 'Intense Quote' }, { id: 'SourceCode', name: 'Source Code' }] };
  const file = await wordFile([
    new docx.Paragraph({ children: [new docx.TextRun('Opening words')] }),
    new docx.Paragraph({ heading: docx.HeadingLevel.TITLE, children: [new docx.TextRun('A title that isn’t first')] }),
    new docx.Paragraph({ heading: docx.HeadingLevel.HEADING_5, alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun('Fifth level')] }),
    new docx.Paragraph({ children: [new docx.TextRun('Run '), new docx.TextRun({ text: 'npm ci', font: 'Courier New' }), new docx.TextRun({ text: ' and ', highlight: 'green' }), new docx.TextRun({ text: 'double', underline: { type: 'double' } })] }),
    new docx.Paragraph({ children: [new docx.TextRun({ text: 'SELECT 1;', font: 'Consolas' })] }),
    new docx.Paragraph({ style: 'SourceCode', children: [new docx.TextRun('line two')] }),
    new docx.Paragraph({ style: 'Quote', children: [new docx.TextRun('Quoted')] }),
    new docx.Paragraph({ style: 'IntenseQuote', children: [new docx.TextRun('Loudly')] }),
    new docx.Paragraph({ children: [new docx.ImageRun({ type: 'bmp', data: new Uint8Array(58), transformation: { width: 1, height: 1 } })] }),
    new docx.Paragraph({ children: [new docx.ImageRun({ type: 'png', data: PNG, transformation: { width: 1, height: 1 }, altText: { name: 'n', description: '', title: 'Titled only' } })] }),
  ], { styles });
  const { title, content } = await importDocx(file, { onImage });
  assert.equal(title, null);
  assert.deepEqual(content.content.map((n) => [n.type, n.attrs?.level ?? null, n.attrs?.textAlign ?? null]).slice(0, 3), [['paragraph', null, null], ['heading', 1, null], ['heading', 3, 'center']]);
  assert.deepEqual(content.content[3].content.map((n) => [n.text, (n.marks ?? []).map((m) => m.type).join()]), [['Run ', ''], ['npm ci', 'code'], [' and ', 'highlight'], ['double', 'underline']]);
  assert.deepEqual(content.content.slice(4, 6).map((n) => [n.type, allText(n)]), [['codeBlock', 'SELECT 1;\nline two'], ['blockquote', 'Quoted\nLoudly']]);
  // a BMP isn't something a doc shows, so it never reaches onImage
  assert.deepEqual(uploads.map((u) => u.alt), ['Titled only']);
  assert.equal(content.content.filter((n) => n.type === 'sealedImage').length, 1);
});

test('links in a Word file keep only web and mail addresses', async () => {
  const targets = ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', '\\\\evil\\share', '//evil.example', 'https://nil.example/ok', 'mailto:team@nil.example'];
  const file = await wordFile([new docx.Paragraph({ children: targets.map((link, i) => new docx.ExternalHyperlink({ link, children: [new docx.TextRun(`link${i} `)] })) })]);
  const { content } = await importDocx(file, { onImage });
  assert.deepEqual(hrefs(content), ['https://nil.example/ok', 'mailto:team@nil.example']);
  assert.equal(allText(content), targets.map((_, i) => `link${i}`).join(' '));
});

test('markup written in a Word file stays text', async () => {
  const lines = ['<script>alert(1)</script>', '<iframe src="javascript:alert(1)"></iframe>', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', '&lt;b&gt; &amp;'];
  const { content } = await importDocx(await wordFile(lines.map((line) => new docx.Paragraph(line))), { onImage });
  assert.deepEqual(content.content.map(allText), lines);
  assert.deepEqual([...kinds(content)], ['doc', 'paragraph', 'text']);
});

test('a huge Word file comes in, and a huge doc goes out', async () => {
  const started = Date.now();
  const rows = Array.from({ length: 300 }, (_, r) => new docx.TableRow({ children: [0, 1, 2, 3].map((c) => new docx.TableCell({ children: [new docx.Paragraph(`r${r}c${c}`)] })) }));
  const paragraphs = Array.from({ length: 5000 }, (_, i) => new docx.Paragraph({ children: [new docx.TextRun(`Paragraph ${i} `), new docx.TextRun({ text: 'bold', bold: true })] }));
  const { content } = await importDocx(await wordFile([...paragraphs, new docx.Table({ rows })]), { onImage });
  assert.equal(content.content.length, 5001);
  assert.equal(allText(content.content[4999]), 'Paragraph 4999 bold');
  assert.equal(content.content[5000].content.length, 300);
  const big = doc(...Array.from({ length: 20_000 }, (_, i) => para(text(`Line ${i} `), text('bold', 'bold'))));
  const body = await part(await toWord(big), 'word/document.xml');
  assert.equal((body.match(/<w:p>/g) ?? []).length + (body.match(/<w:p /g) ?? []).length, 20_001);
  assert.ok(Date.now() - started < 60_000, `took ${Date.now() - started} ms`);
});

test('a file too large, or not a Word file at all, is refused', async () => {
  await assert.rejects(importDocx(new Blob([new Uint8Array(40 * 1024 * 1024 + 1)]), { onImage }), /too large/);
  await assert.rejects(importDocx(new Blob([crypto.getRandomValues(new Uint8Array(4096))]), { onImage }));
});

test('past the image limit, the rest of a file’s images are left out', async () => {
  uploads.length = 0;
  const images = Array.from({ length: 302 }, () => new docx.Paragraph({ children: [new docx.ImageRun({ type: 'png', data: PNG, transformation: { width: 1, height: 1 } })] }));
  const { content } = await importDocx(await wordFile(images), { onImage });
  assert.equal(uploads.length, 300);
  assert.equal(content.content.filter((n) => n.type === 'sealedImage').length, 300);
});

test('the HTML read from a Word file is sanitised before the schema parses it', () => {
  const images = [{ blob: 'b', key: 'k', mime: 'image/png', name: 'n.png', width: 1, height: 1, alt: 'ok' }];
  const html = [
    '<h1 data-title="1">The <em>title</em></h1>',
    '<p>Before<script>alert(1)</script> after</p>',
    '<iframe src="https://evil.example/" srcdoc="<script>alert(2)</script>"></iframe>',
    '<p><a href="javascript:alert(1)">js</a> <a href=" javascript:alert(1)">space</a> <a href="jav&#x09;ascript:alert(1)">tab</a> <a href="data:text/html,x">data</a> <a href="https://nil.example/" onclick="alert(1)" style="color:red">ok</a></p>',
    '<p><img src=x onerror=alert(1)><img data-image="7"><img data-image="0" src="https://evil.example/x.png" onerror="alert(1)"></p>',
    '<svg><script>alert(3)</script><a xlink:href="javascript:alert(1)">svg</a></svg>',
    '<form action="https://evil.example/"><input name="x"><button>Sign in</button></form>',
    '<object data="x.swf"></object><embed src="x.swf">',
    '<p data-align="center;color:red" style="text-align:right">no align</p>',
    '<style>p{display:none}</style><p>visible</p>',
    // last, since the parser takes everything after it into the <style>
    '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  ].join('');
  const { title, content } = parseDocxHtml(`<p>Intro</p>${html}`, images);
  assert.equal(title, null, 'a title after other content is only a heading');
  // blank paragraphs before it don't count as content
  const after = parseDocxHtml(`<p></p>${html}`, images);
  assert.equal(after.title, 'The title');
  for (const result of [content, after.content]) {
    assert.ok([...kinds(result)].every((k) => ['doc', 'paragraph', 'heading', 'text', 'sealedImage', 'table', 'tableRow', 'tableCell'].includes(k)), [...kinds(result)].join());
    assert.deepEqual(hrefs(result), ['https://nil.example/']);
    assert.doesNotMatch(JSON.stringify(result), /alert\([23]\)|evil|onerror|onclick|src/);
  }
  const blocks = after.content.content;
  assert.deepEqual(blocks.slice(0, 2).map(allText), ['', 'Before after']);
  assert.deepEqual(blocks.filter((n) => n.type === 'sealedImage').map((n) => ({ ...n.attrs })), images);
  const plain = blocks.find((n) => allText(n) === 'no align');
  assert.equal(plain.attrs.textAlign, null);
  assert.ok(blocks.some((n) => allText(n) === 'visible'));
});

test('task lists and nested lists come back as the doc had them', async () => {
  const content = doc(
    { type: 'taskList', content: [task(true, para(text('Done', 'bold'), text(' and bold'))), task(false, para(), { type: 'bulletList', content: [item(para(text('Plain under a task')))] })] },
    { type: 'bulletList', content: [item(para(text('L1')), { type: 'orderedList', attrs: { start: 1 }, content: [item(para(text('L2')), { type: 'bulletList', content: [item(para(text('L3')))] })] })] },
    heading(1, text('After')),
  );
  assert.deepEqual((await roundTrip(content)).content, normal(content));
});
