import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import importMarkdown from '../src/lib/docConvert/importMarkdown.ts';
import exportMarkdown from '../src/lib/docConvert/exportMarkdown.ts';
import docSchema from '../src/lib/docConvert/docSchema.ts';
import crc32 from '../src/lib/docConvert/crc32.ts';
import readZip from './helpers/readZip.js';
import { faithful, doc, para, text, heading, link, item, task, cell, image, PNG, PNG_WIDE } from './helpers/docSamples.js';

const normal = (json) => docSchema().nodeFromJSON(json).toJSON();
const people = (id) => ({ u1: 'Ann Lee' })[id] ?? '';
const markdownOf = async (content) => (await exportMarkdown({ title: 'Plan', content }, { readImage: () => assert.fail('nothing to read'), people })).file.text();
const roundTrip = async (content) => importMarkdown(await markdownOf(content));
const kinds = (json, out = new Set()) => (out.add(json.type), (json.content ?? []).forEach((c) => kinds(c, out)), out);
const allText = (json) => (json.text ?? '') + (json.content ?? []).map(allText).join(json.type === 'paragraph' ? '' : '\n');
const hrefs = (json, out = []) => {
  for (const m of json.marks ?? []) if (m.type === 'link') out.push(m.attrs.href);
  (json.content ?? []).forEach((c) => hrefs(c, out));
  return out;
};

test('every node and mark Markdown can carry comes back from an export unchanged', async () => {
  assert.deepEqual(await roundTrip(faithful()), normal(faithful()));
});

test('the export is GitHub-flavoured Markdown a person can read', async () => {
  const md = await markdownOf(faithful());
  assert.match(md, /^# Quarterly plan\n\n## Goals\n\n### Details\n\n/);
  assert.match(md, /Plain, \*\*bold\*\*, \*italic\*, <ins>underlined<\/ins>, ~~struck~~, `code\(\)`, <mark>highlighted<\/mark> and a \[link\]\(https:\/\/nil\.example\/docs\?a=1&b=2\)\./);
  assert.match(md, /\*\*\*Both at once\*\*\* then a mail \[link\]\(mailto:team@nil\.example\) and \[\*\*bold link\*\*\]\(https:\/\/nil\.example\/\)/);
  assert.match(md, /First line\\\nsecond line/);
  assert.match(md, /\n- One\n {2}- One a\n {2}- One b\n- Two\n/);
  assert.match(md, /\n1\. First\n2\. Second\n {3}1\. Second a\n/);
  assert.match(md, /\n- \[ \] Write the brief\n- \[x\] Book the room\n {2}- \[x\] Confirm with facilities\n/);
  assert.match(md, /\n\| Owner \| Status \|\n\| --- \| --- \|\n\| Ann \| \*\*Done\*\* \|\n/);
  assert.match(md, /\n```\nconst total = items\n {2}\.map\(\(i\) => i\.cost\)\n\n {2}\.reduce\(\(a, b\) => a \+ b, 0\);\n```\n/);
  assert.match(md, /\n> Ship small, ship often\.\n\n---\n\nThe end\.\n$/);
});

test('lists, quotes and tables keep their shape', async () => {
  const content = doc(
    { type: 'blockquote', content: [para(text('Outer')), { type: 'blockquote', content: [para(text('Inner'))] }, { type: 'bulletList', content: [item(para(text('In a quote')))] }] },
    { type: 'orderedList', attrs: { start: 7 }, content: [item(para(text('Seventh')), para(text('More about it')), { type: 'codeBlock', attrs: { language: 'sh' }, content: [text('npm test')] }), item(para(text('Eighth')))] },
    // two lists of one kind in a row stay two lists
    { type: 'bulletList', content: [item(para(text('A')))] },
    { type: 'bulletList', content: [item(para(text('B')))] },
    { type: 'orderedList', attrs: { start: 1 }, content: [item(para(text('C')))] },
    { type: 'orderedList', attrs: { start: 1 }, content: [item(para(text('D')))] },
    { type: 'taskList', content: [task(false, para())] },
    { type: 'bulletList', content: [item(para(), { type: 'bulletList', content: [item(para(text('Under an empty item')))] })] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', attrs: { align: 'left' }, content: [para(text('L'))] }, { type: 'tableHeader', attrs: { align: 'center' }, content: [para(text('C'))] }, { type: 'tableHeader', attrs: { align: 'right' }, content: [para(text('R'))] }] }, { type: 'tableRow', content: ['1', '2', '3'].map((n, i) => ({ type: 'tableCell', attrs: { align: ['left', 'center', 'right'][i] }, content: [para(text(n))] })) }] },
    { type: 'codeBlock', attrs: { language: 'md' }, content: [text('```\nfenced inside\n```')] },
    { type: 'codeBlock', attrs: { language: null } },
  );
  assert.deepEqual(await roundTrip(content), normal(content));
  assert.match(await markdownOf(content), /\n\| :--- \| :---: \| ---: \|\n/);
});

test('text that looks like Markdown stays text', async () => {
  const tricky = [
    '1. not a list',
    '2) nor this',
    '# not a heading',
    '- not a bullet',
    '+ nor this',
    '* nor this',
    '> not a quote',
    '---',
    '===',
    '| not | a table |',
    ':--- | ---',
    '*not italic* and _not either_ and __nor bold__',
    'snake_case_names stay as they are',
    '`not code` and ``double``',
    '~~not struck~~ ~single~',
    '[not](a link) and ![not](an image) and <https://not.autolinked.example>',
    '<b>not bold</b> <script>alert(1)</script> <!-- not a comment -->',
    '&amp; &copy; &#169; &#x1F600; are not entities',
    'a back\\slash \\* and a trailing one \\',
    '[^not a footnote] and [ref]: https://not.a.definition.example',
    '==not highlighted== ++not underlined++',
    'C# ends with a hash #',
  ];
  const content = doc(...tricky.map((t) => para(text(t))), heading(2, text('Heading ending in #')), heading(3, text('# hash inside')));
  assert.deepEqual(await roundTrip(content), normal(content));
  const table = doc({ type: 'table', content: [{ type: 'tableRow', content: [cell('tableHeader', para(text('a | b'))), cell('tableHeader', para(text('x|y', 'code')))] }, { type: 'tableRow', content: [cell('tableCell', para(text('- c'))), cell('tableCell', para(text('1. d')))] }] });
  assert.deepEqual(await roundTrip(table), normal(table));
  const spans = doc(para(text('a`b', 'code'), text(' '), text('`edge`', 'code'), text(' '), text(' padded ', 'code'), text(' '), text('a', 'code'), text('b', 'code')));
  assert.deepEqual(await roundTrip(spans), normal(spans));
});

test('marks open and close around words, never around the spaces at their edges', async () => {
  const content = doc(para(text('a'), text(' bold ', 'bold'), text('b'), text(' both', 'bold', 'italic'), text(' end ', 'bold'), text('c')));
  const md = await markdownOf(content);
  assert.equal(md, 'a **bold** b ***both* end** c\n');
  const back = await roundTrip(content);
  assert.equal(allText(back), 'a bold b both end c');
  assert.deepEqual(back.content[0].content.map((n) => [n.text, (n.marks ?? []).map((m) => m.type).join('+')]), [['a ', ''], ['bold', 'bold'], [' b ', ''], ['both', 'bold+italic'], [' end', 'bold'], [' c', '']]);
  // a mark that runs across a line break closes before it and opens again after
  const across = doc(para(text('over', 'bold'), { type: 'hardBreak' }, text('the break', 'bold')));
  assert.equal(await markdownOf(across), '**over**\\\n**the break**\n');
  assert.deepEqual(await roundTrip(across), normal(across));
});

test('what Markdown has no place for is written as text', async () => {
  const content = doc(
    para({ type: 'mention', attrs: { id: 'u1', label: 'Ann' } }, text(' and '), { type: 'mention', attrs: { id: 'gone', label: 'Old name' } }, text(' agreed.')),
    para(text('Discussed', { type: 'comment', attrs: { thread: 't1' } }), text(' in review.')),
    { type: 'paragraph', attrs: { textAlign: 'center' }, content: [text('Centred')] },
    { type: 'sealedFile', attrs: { blob: 'f1', key: 'k', mime: 'application/pdf', name: 'Budget [final].pdf', size: 123456 } },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 2 }, content: [para(text('Wide'))] }] }, { type: 'tableRow', content: [cell('tableCell', para(text('Two')), para(text('paragraphs'))), cell('tableCell', { type: 'bulletList', content: [item(para(text('listed')))] })] }] },
    para(text('end')),
  );
  const md = await markdownOf(content);
  assert.match(md, /^@Ann Lee and @Old name agreed\.\n\nDiscussed in review\.\n\nCentred\n\nAttached file: Budget \\\[final\\\]\.pdf \(121 KB\)\n\n/);
  assert.match(md, /\| Wide \| {2}\|\n\| --- \| --- \|\n\| Two<br>paragraphs \| listed \|/);
  const back = await roundTrip(content);
  assert.deepEqual(back.content.slice(0, 4).map(allText), ['@Ann Lee and @Old name agreed.', 'Discussed in review.', 'Centred', 'Attached file: Budget [final].pdf (121 KB)']);
  assert.ok(!kinds(back).has('mention') && !JSON.stringify(back).includes('comment') && !JSON.stringify(back).includes('"center"'));
  assert.deepEqual(back.content[4].content[1].content[0].content[0].content.map((n) => n.type), ['text', 'hardBreak', 'text']);
});

test('GitHub Markdown written elsewhere comes in', async () => {
  const readme = [
    'Setext title',
    '============',
    '',
    '#### Deep heading',
    '',
    'Some *emphasis*, __strong__, ~~gone~~, `code`, a www.example.com autolink, <https://nil.example/x> and team@nil.example.',
    'This soft line joins the last one.  ',
    'This one follows a hard break, and [a reference][ref].',
    '',
    '[ref]: https://nil.example/ref "Title"',
    '',
    '* star bullet',
    '+ plus bullet',
    '',
    '1) paren list',
    '2) second',
    '',
    '* [X] capital X task',
    '* [ ] open task',
    '',
    'Code indented four spaces:',
    '',
    '    indented code',
    '',
    '~~~python',
    'print("tilde fence")',
    '~~~',
    '',
    '| Left | Right |',
    '|:-----|------:|',
    '| *a*  | `b\\|c` |',
    '| <br>x<br>y |',
    '',
    '![Diagram of the flow](https://nil.example/flow.png)',
    '',
    'Entities: &copy; &#169; &#x1F600; &unknown; &#0;',
    '',
    'Inline <u>underline</u>, <ins>also</ins>, <mark>marked</mark> and a<br/>break.',
  ].join('\n');
  const back = importMarkdown(readme);
  const [title, deep, para1, star, plus, paren, tasks, , indented, fenced, table, image, entities, html] = back.content;
  assert.deepEqual([title.type, title.attrs.level, allText(title)], ['heading', 1, 'Setext title']);
  assert.deepEqual([deep.attrs.level, allText(deep)], [3, 'Deep heading']);
  assert.equal(allText(para1).replace(/\s+/g, ' '), 'Some emphasis, strong, gone, code, a www.example.com autolink, https://nil.example/x and team@nil.example. This soft line joins the last one.This one follows a hard break, and a reference.');
  assert.deepEqual(hrefs(para1), ['http://www.example.com', 'https://nil.example/x', 'mailto:team@nil.example', 'https://nil.example/ref']);
  assert.ok(para1.content.some((n) => n.type === 'hardBreak'));
  assert.deepEqual([star.type, plus.type, paren.type, paren.attrs.start], ['bulletList', 'bulletList', 'orderedList', 1]);
  assert.deepEqual(tasks.content.map((t) => [t.attrs.checked, allText(t)]), [[true, 'capital X task'], [false, 'open task']]);
  assert.deepEqual([indented.type, indented.attrs.language, allText(indented)], ['codeBlock', null, 'indented code']);
  assert.deepEqual([fenced.attrs.language, allText(fenced)], ['python', 'print("tilde fence")']);
  assert.deepEqual(table.content[0].content.map((c) => [c.type, c.attrs.align]), [['tableHeader', 'left'], ['tableHeader', 'right']]);
  assert.deepEqual(table.content[1].content[1].content[0].content[0], { type: 'text', marks: [{ type: 'code' }], text: 'b|c' });
  assert.deepEqual(table.content[2].content[0].content[0].content.map((n) => n.type), ['hardBreak', 'text', 'hardBreak', 'text']);
  // the image itself can't come in without its bytes, but what it showed is said
  assert.deepEqual([image.type, allText(image)], ['paragraph', 'Diagram of the flow']);
  assert.equal(allText(entities), 'Entities: © © 😀 &unknown; \u{fffd}');
  assert.deepEqual(html.content.map((n) => [n.type, n.text, (n.marks ?? []).map((m) => m.type).join()]), [['text', 'Inline ', ''], ['text', 'underline', 'underline'], ['text', ', ', ''], ['text', 'also', 'underline'], ['text', ', ', ''], ['text', 'marked', 'highlight'], ['text', ' and a', ''], ['hardBreak', undefined, ''], ['text', 'break.', '']]);
});

test('only web and mail links come in from Markdown', async () => {
  const bad = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', '&#106;avascript:alert(1)', 'javascript&colon;alert(1)', 'vbscript:msgbox(1)', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', 'file:///etc/passwd', '//evil.example/x', 'ftp://evil.example/', '#top', 'relative/page.md', 'https:/one-slash.example'];
  const lines = bad.flatMap((url) => [`[click](${url})`, `[click](<${url}>)`, `<${url}>`, `[ref ${url}][r-${bad.indexOf(url)}]`, `[r-${bad.indexOf(url)}]: ${url}`, '']);
  const back = importMarkdown(lines.join('\n'));
  assert.deepEqual(hrefs(back), []);
  assert.match(allText(back), /click/);
  const good = importMarkdown('[a](https://nil.example/a) [b](http://nil.example/b) [c](mailto:c@nil.example) [d](HTTPS://NIL.EXAMPLE/D)');
  assert.deepEqual(hrefs(good), ['https://nil.example/a', 'http://nil.example/b', 'mailto:c@nil.example', 'HTTPS://NIL.EXAMPLE/D']);
  // and an export never writes one that isn't, whatever a doc holds
  const md = await markdownOf(doc(para(text('x', link('javascript:alert(1)')), text(' y', link('https://ok.example/a b(c)')))));
  assert.equal(md, 'x [y](https://ok.example/a%20b%28c%29)\n');
});

test('HTML in Markdown is never parsed; it stays the text it was', async () => {
  const attacks = ['<script>alert(1)</script>', '<iframe src="javascript:alert(1)"></iframe>', '<img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">x</a>', '<svg onload=alert(1)>', '<div><p>block <b>html</b></p></div>', '<style>body{display:none}</style>'];
  for (const html of attacks) {
    for (const markdown of [html, `inline ${html} here`, `> ${html}`, `- ${html}`, `| a |\n|---|\n| ${html} |`]) {
      const back = importMarkdown(markdown);
      assert.ok([...kinds(back)].every((k) => ['doc', 'paragraph', 'text', 'hardBreak', 'blockquote', 'bulletList', 'listItem', 'table', 'tableRow', 'tableHeader', 'tableCell'].includes(k)), markdown);
      assert.ok(allText(back).replace(/\n/g, '').includes(html.replace(/\n/g, '')), `${markdown} lost its text`);
      assert.deepEqual(hrefs(back), []);
    }
  }
});

test('a huge document comes in and goes out', async () => {
  const lines = Array.from({ length: 30_000 }, (_, i) => `Paragraph ${i} with **bold**, *italic* and a [link](https://nil.example/${i}).`);
  const started = Date.now();
  const back = importMarkdown(lines.join('\n\n'));
  assert.equal(back.content.length, 30_000);
  assert.deepEqual(hrefs(back.content[29_999]), ['https://nil.example/29999']);
  const md = await markdownOf(back);
  assert.equal(md.split('\n\n').length, 30_000);
  assert.ok(Date.now() - started < 30_000, `took ${Date.now() - started} ms`);
  assert.throws(() => importMarkdown('x'.repeat(5_000_001)), /too large/);
});

test('nesting deeper than any real document is flattened, not allowed to exhaust memory', () => {
  const depth = (json) => 1 + Math.max(0, ...(json.content ?? []).map(depth));
  const attacks = [
    '>'.repeat(5000) + ' deep quote',
    // four megabytes; without the limit, marked needs gigabytes for it
    Array.from({ length: 2000 }, (_, i) => `${' '.repeat(i * 2)}- level ${i}`).join('\n'),
    Array.from({ length: 2000 }, (_, i) => `${'>'.repeat(i + 1)} line ${i}`).join('\n'),
    '- '.repeat(20_000) + 'one line of bullets',
    '1. '.repeat(10_000) + 'one line of numbers',
    '> - '.repeat(5000) + 'quotes and bullets',
  ];
  for (const markdown of attacks) {
    const started = Date.now();
    const back = importMarkdown(markdown);
    assert.ok(depth(back) < 80, `nested ${depth(back)} deep`);
    assert.ok(Date.now() - started < 10_000, `${markdown.slice(0, 20)} took ${Date.now() - started} ms`);
  }
});

test('emphasis marked would choke on keeps its text without formatting', () => {
  for (const markdown of ['_a'.repeat(30_000), '*'.repeat(20_000) + 'x' + '*'.repeat(20_000), '**_~~'.repeat(20_000) + 'x', '['.repeat(20_000) + 'x' + ']'.repeat(20_000)]) {
    const started = Date.now();
    const back = importMarkdown(markdown);
    assert.ok(Date.now() - started < 10_000, `${markdown.slice(0, 10)} took ${Date.now() - started} ms`);
    assert.ok(allText(back).length > 1000);
  }
});

test('a doc without images exports as a .md file named after its title', async () => {
  const plain = await exportMarkdown({ title: 'Q3: plan / draft?', content: doc(para(text('Hi'))) }, { readImage: () => assert.fail('nothing to read'), people });
  assert.deepEqual([plain.filename, plain.file.type, await plain.file.text()], ['Q3 plan draft.md', 'text/markdown;charset=utf-8', 'Hi\n']);
  for (const [title, name] of [['', 'Untitled.md'], ['  ...  ', 'Untitled.md'], ['CON', 'CON doc.md'], ['Ünïcödé 文档', 'Ünïcödé 文档.md'], ['a\u0000b\nc', 'a b c.md']]) {
    assert.equal((await exportMarkdown({ title, content: doc(para()) }, { readImage: () => assert.fail(), people })).filename, name);
  }
});

test('a doc with images exports as a zip of the .md and an images folder it links into', async () => {
  const read = [];
  const opened = { b1: PNG, b2: PNG_WIDE, b3: PNG_WIDE };
  const readImage = async (attrs) => (read.push(attrs), { bytes: opened[attrs.blob], mime: 'image/png', width: 1, height: 1 });
  const content = doc(
    para(text('Before')),
    image('b1', { name: 'Screen Shot 2026.png', alt: 'The [first] one' }),
    image('b2', { name: 'chart.png', alt: '' }),
    // the same picture again, and another that happens to share a name
    image('b1', { name: 'Screen Shot 2026.png', alt: 'The [first] one' }),
    image('b3', { name: 'chart.png', alt: 'Second chart' }),
    { type: 'blockquote', content: [image('b2', { name: 'chart.png', alt: '' })] },
  );
  const { file, filename } = await exportMarkdown({ title: 'Launch notes', content }, { readImage, people });
  assert.deepEqual([filename, file.type], ['Launch notes.zip', 'application/zip']);
  assert.deepEqual(read.map((a) => a.blob), ['b1', 'b2', 'b3']);
  assert.deepEqual(read[0], content.content[1].attrs);
  const files = readZip(new Uint8Array(await file.arrayBuffer()));
  assert.deepEqual([...files.keys()], ['Launch notes.md', 'images/screen-shot-2026.png', 'images/chart.png', 'images/chart-2.png']);
  for (const entry of files.values()) assert.deepEqual([entry.method, entry.flags & 0x0800], [0, 0x0800]);
  assert.deepEqual(files.get('images/screen-shot-2026.png').bytes, PNG);
  assert.deepEqual(files.get('images/chart-2.png').bytes, PNG_WIDE);
  const md = new TextDecoder().decode(files.get('Launch notes.md').bytes);
  // an image with no alt text is described by its file name
  assert.equal(md, 'Before\n\n![The \\[first\\] one](images/screen-shot-2026.png)\n\n![chart.png](images/chart.png)\n\n![The \\[first\\] one](images/screen-shot-2026.png)\n\n![Second chart](images/chart-2.png)\n\n> ![chart.png](images/chart.png)\n');
});

test('the zip writer’s checksums are the standard CRC-32', () => {
  const samples = [new Uint8Array(0), new TextEncoder().encode('123456789'), crypto.getRandomValues(new Uint8Array(65_536))];
  for (const bytes of samples) assert.equal(crc32(bytes), zlib.crc32(bytes));
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
