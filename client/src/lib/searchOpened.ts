import foldText from './foldText';
import searchWords from './searchWords';
import excerpt from './excerpt';
import openedText from '../state/openedText';
import type Task from '../types/Task';
import type SearchHit from '../types/SearchHit';

type Field = SearchHit['field'];

// Like the server's search: every word has to appear somewhere. Reports the first field
// (title first) that holds one of them.
function match(fields: [Field, string][], words: string[]) {
  const folded = fields.map(([field, text]) => [field, text, foldText(text)] as const);
  const all = folded.map(([, , f]) => f).join('\n');
  if (!words.every((w) => all.includes(w))) return null;
  return folded.find(([, , f]) => words.some((w) => f.includes(w))) ?? null;
}

// Search over what only this browser can read: private tasks it has opened (title, notes,
// checklist and the comments it showed) and docs it has decrypted. Nothing leaves the tab.
export default function searchOpened(query: string, tasks: Task[], limit = 8): SearchHit[] {
  const words = searchWords(query);
  if (!words.length) return [];
  const hits: SearchHit[] = [];

  for (const t of tasks) {
    if (!t.sealed || t.locked || t.deletedAt) continue;
    const found = match(
      [
        ['title', t.title],
        ['description', t.description ?? ''],
        ['checklist', (t.checklist ?? []).map((i) => i.text).join(' · ')],
        ['comment', openedText.comments(t.id).join(' · ')],
      ],
      words,
    );
    if (found) hits.push({ kind: 'task', id: t.id, number: t.number, status: t.status, title: t.title, field: found[0], snippet: found[0] === 'title' ? '' : excerpt(found[1], query) });
  }

  for (const d of openedText.docs()) {
    const found = match([['title', d.title], ['body', d.body ?? '']], words);
    if (found) hits.push({ kind: 'doc', id: d.id, title: d.title, field: found[0], snippet: found[0] === 'title' ? '' : excerpt(found[1], query) });
  }

  // title matches first, then the rest in the order found
  return hits.sort((a, b) => Number(b.field === 'title') - Number(a.field === 'title')).slice(0, limit);
}
