import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import headingId from '../../client/src/lib/headingId.ts';
import helpPath from '../../client/src/lib/help/helpPath.ts';
import searchHelp from '../../client/src/lib/help/searchHelp.ts';

// The in-app help renders docs/*.md, so a broken page or link there is a broken screen in Nil.
const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs');
const pages = fs.readdirSync(DOCS).filter((f) => f.endsWith('.md'));
const read = (file) => fs.readFileSync(path.join(DOCS, file), 'utf8');
const prose = (text) => text.replace(/^```[\s\S]*?^```/gm, '');

// the same ids the app gives headings, repeats numbered like GitHub does
function anchors(text) {
  const seen = new Map();
  return new Set(
    [...prose(text).matchAll(/^#{1,3}\s+(.+)$/gm)].map(([, title]) => {
      const base = headingId(title.replace(/`/g, ''));
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return n ? `${base}-${n}` : base;
    }),
  );
}

test('every help page has a title and is listed in the docs index', () => {
  const index = read('README.md');
  for (const page of pages) {
    assert.match(read(page), /^# \S/, `${page} starts with a "# " title`);
    if (page !== 'README.md') assert.ok(index.includes(`](${page})`), `${page} is linked from docs/README.md`);
  }
});

test('links between help pages lead to a page and a heading that exist', () => {
  for (const page of pages) {
    for (const [, target, hash] of prose(read(page)).matchAll(/\]\(([\w-]*?)(?:\.md)?(#[\w-]+)?\)/g)) {
      if (!target && !hash) continue;
      const file = target ? `${target}.md` : page;
      assert.ok(pages.includes(file), `${page} links to ${file}`);
      if (hash) assert.ok(anchors(read(file)).has(hash.slice(1)), `${page} links to ${file}${hash}`);
    }
  }
});

test('help links stay inside the help center', () => {
  assert.equal(helpPath('votes.md', 'tasks'), '/help/votes');
  assert.equal(helpPath('./privacy-model.md#honest-limits', 'faq'), '/help/privacy-model#honest-limits');
  assert.equal(helpPath('README.md', 'faq'), '/help');
  assert.equal(helpPath('#reminders', 'time-and-reminders'), '/help/time-and-reminders#reminders');
  assert.equal(helpPath('../SECURITY.md', 'faq'), null);
  assert.equal(helpPath('https://example.com', 'faq'), null);
});

test('help search needs every word, ranks title matches first and quotes the text', () => {
  const topic = (slug, title, plain) => ({ slug, title, plain, text: plain, group: 'Test' });
  const topics = [topic('tasks', 'Tasks', 'Private tasks are encrypted.'), topic('private-tasks', 'Private tasks', 'Only two people can see one.')];
  assert.deepEqual(searchHelp(topics, 'private').map((h) => h.topic.slug), ['private-tasks', 'tasks']);
  assert.deepEqual(searchHelp(topics, 'private encrypted').map((h) => h.topic.slug), ['tasks']);
  assert.equal(searchHelp(topics, 'encrypted')[0].snippet.match, 'encrypted');
  assert.deepEqual(searchHelp(topics, '   '), []);
});
