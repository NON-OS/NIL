import clip from './clip';
import dateFromText from './dateFromText';
import recurrenceFromText from './recurrenceFromText';
import type ImportFile from '../../types/ImportFile';
import type ImportItem from '../../types/ImportItem';
import type Priority from '../../types/Priority';

// Todoist's CSV counts priority the way its app shows it: 1 is p1, the most urgent, and 4 is
// the default for tasks nobody prioritised.
const PRIORITY: Record<string, Priority> = { '1': 4, '2': 3, '3': 2, '4': 0 };

// "Ana Lopez (12345678)" -> "Ana Lopez"
const person = (value: string) => value.replace(/\s*\(\d+\)\s*$/, '').trim() || null;

// Todoist writes labels into the task's text as @name.
const LABEL = /(^|\s)@([\p{L}\p{N}_-]+)/gu;

// A Todoist project exported as CSV: one row per task, section or comment ("note"), in order.
// Indented tasks become checklist items of the task above them, notes become its comments,
// and the file's name is the project. Todoist leaves finished tasks out of these files.
export default function fromTodoist(rows: string[][], fileName: string): ImportFile {
  const header = rows[0].map((h) => h.trim().toUpperCase());
  const col = (row: string[], name: string) => (row[header.indexOf(name)] ?? '').trim();
  const project = fileName.replace(/\.csv$/i, '').trim() || null;
  const items: ImportItem[] = [];
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const type = col(row, 'TYPE').toLowerCase();
    const content = col(row, 'CONTENT');
    const parent = items.at(-1);
    if (type === 'note' && parent && content) {
      parent.comments.push({ author: person(col(row, 'AUTHOR')), date: null, text: content });
    } else if (type === 'task' && content && Number(col(row, 'INDENT') || 1) > 1 && parent) {
      parent.checklist.push({ text: clip(content, 500), done: false });
    } else if (type === 'task' && content) {
      const due = col(row, 'DATE');
      const dueDate = dateFromText(due);
      const recurrence = recurrenceFromText(due);
      const notes = col(row, 'DESCRIPTION');
      // a due date we couldn't read is kept in words, so nothing is silently lost
      const unread = due && !dueDate && !recurrence ? `Due in Todoist: ${due}` : '';
      const labels = [...content.matchAll(LABEL)].map((m) => m[2]);
      items.push({
        title: clip(content.replace(LABEL, '$1').replace(/\s+/g, ' '), 300) || clip(content, 300),
        description: clip([notes, unread].filter(Boolean).join('\n\n'), 50_000),
        status: 'todo',
        priority: PRIORITY[col(row, 'PRIORITY')] ?? 0,
        dueDate,
        recurrence,
        person: person(col(row, 'RESPONSIBLE')),
        project,
        labels,
        checklist: [],
        comments: [],
      });
    } else skipped++;
  }
  return { source: 'todoist', name: fileName, items, skipped };
}
