import type { JSONContent } from '@tiptap/core';

// The boxes a Word export writes in front of each task, as Nil's own export does.
const BOX = /^([☐☑☒])\s?/;

const firstText = (item: JSONContent) => item.content?.[0]?.content?.[0];
const boxed = (item: JSONContent) => {
  const text = firstText(item);
  return text?.type === 'text' && BOX.test(text.text ?? '');
};

function taskItem(item: JSONContent): JSONContent {
  const [para, ...blocks] = item.content ?? [];
  const [first, ...inline] = para.content ?? [];
  const text = (first.text ?? '').replace(BOX, '');
  const content = text ? [{ ...first, text }, ...inline] : inline;
  return { type: 'taskItem', attrs: { checked: first.text?.[0] !== '☐' }, content: [{ ...para, content }, ...blocks] };
}

// Word readers run a task list and the bullet list after it together, so a list is split
// wherever its items stop or start having boxes.
function split(list: JSONContent): JSONContent[] {
  const runs: JSONContent[] = [];
  for (const item of list.content ?? []) {
    const task = boxed(item);
    const last = runs.at(-1);
    if (last && (last.type === 'taskList') === task) last.content!.push(task ? taskItem(item) : item);
    else runs.push(task ? { type: 'taskList', content: [taskItem(item)] } : { ...list, content: [item] });
  }
  return runs;
}

// Items that open with a checkbox come back as task items, in task lists of their own.
export default function checkboxLists(node: JSONContent): JSONContent {
  if (!node.content) return node;
  const content = node.content.flatMap((child) => {
    const done = checkboxLists(child);
    return done.type === 'bulletList' || done.type === 'orderedList' ? split(done) : [done];
  });
  return { ...node, content };
}
