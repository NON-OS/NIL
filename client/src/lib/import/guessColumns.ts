import type CsvColumns from '../../types/CsvColumns';

// Header names other apps and spreadsheets commonly use for each part of a task. The first
// header that matches wins; anything unrecognised can still be picked by hand.
const NAMES: Record<keyof CsvColumns, RegExp> = {
  title: /^(title|name|task|task name|summary|subject|content|item|to ?do)$/i,
  description: /^(description|notes?|details|body|desc)$/i,
  dueDate: /^(due|due date|due on|deadline|date|end date)$/i,
  person: /^(assignee|assigned to|owner|responsible|person|who|assigned)$/i,
  project: /^(project|list|board|area|category|section|column)$/i,
  status: /^(status|state|stage|progress|done|completed|complete)$/i,
  priority: /^(priority|importance|urgency)$/i,
  labels: /^(labels?|tags?)$/i,
};

export default function guessColumns(header: string[]): CsvColumns {
  const find = (pattern: RegExp) => header.findIndex((h) => pattern.test(h.trim()));
  const columns = Object.fromEntries(Object.entries(NAMES).map(([key, pattern]) => [key, find(pattern)])) as unknown as CsvColumns;
  // without a recognisable title column, the first column is the best guess
  if (columns.title < 0 && header.length) columns.title = 0;
  return columns;
}
