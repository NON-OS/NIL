import clip from './clip';
import dateFromText from './dateFromText';
import statusFromText from './statusFromText';
import priorityFromText from './priorityFromText';
import type CsvColumns from '../../types/CsvColumns';
import type ImportFile from '../../types/ImportFile';
import type ImportItem from '../../types/ImportItem';

// Any CSV with a header row, read through the column choices the person confirmed. Rows
// without a title are skipped.
export default function fromCsv(rows: string[][], columns: CsvColumns, fileName: string): ImportFile {
  const cell = (row: string[], index: number) => (index >= 0 ? (row[index] ?? '').trim() : '');
  const items: ImportItem[] = [];
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const title = cell(row, columns.title);
    if (!title) {
      skipped++;
      continue;
    }
    items.push({
      title: clip(title, 300),
      description: clip(cell(row, columns.description), 50_000),
      status: statusFromText(cell(row, columns.status)),
      priority: priorityFromText(cell(row, columns.priority)),
      dueDate: dateFromText(cell(row, columns.dueDate)),
      recurrence: null,
      person: cell(row, columns.person) || null,
      project: cell(row, columns.project) || null,
      labels: cell(row, columns.labels).split(/[,;|]/).map((l) => l.trim()).filter(Boolean),
      checklist: [],
      comments: [],
    });
  }
  return { source: 'csv', name: fileName, items, skipped };
}
