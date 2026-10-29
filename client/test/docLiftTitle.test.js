import { test } from 'node:test';
import assert from 'node:assert/strict';
import importMarkdown from '../src/lib/docConvert/importMarkdown.ts';
import liftTitle from '../src/lib/docConvert/liftTitle.ts';

test('a file that opens with a top-level heading names the new doc, once', () => {
  const blocks = importMarkdown('# Atlas 2.0 *launch* plan\n\nWe ship in December.\n\n## Goals\n').content;
  const { title, blocks: rest } = liftTitle(blocks);
  assert.equal(title, 'Atlas 2.0 launch plan');
  assert.equal(rest.length, blocks.length - 1);
  assert.equal(rest[0].type, 'paragraph');
});

test('anything else keeps its opening block', () => {
  for (const md of ['Just a paragraph.', '## A second-level heading', '#   \n\ntext']) {
    const blocks = importMarkdown(md).content;
    assert.deepEqual(liftTitle(blocks), { title: null, blocks });
  }
  assert.deepEqual(liftTitle([]), { title: null, blocks: [] });
});
