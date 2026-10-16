import parseCsv from './parseCsv';
import fromTodoist from './fromTodoist';
import fromTrello from './fromTrello';
import type ImportFile from '../../types/ImportFile';

type Read = { kind: 'ready'; file: ImportFile } | { kind: 'csv'; name: string; rows: string[][] };

// Reads a file in the browser and works out where it came from: a Trello board (JSON), a
// Todoist project (CSV with TYPE and CONTENT columns) or some other CSV, which still needs
// its columns confirmed. Nothing is uploaded here.
export default async function readImportFile(file: File, maxBytes: number): Promise<Read> {
  if (file.size > maxBytes) throw new Error(`That file is larger than ${Math.round(maxBytes / 1_000_000)} MB. Export a smaller part, like one project or board at a time.`);
  const text = await file.text();
  if (/\.json$/i.test(file.name) || text.trimStart().startsWith('{')) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('That JSON file couldn’t be read. Export the board from Trello again and pick the new file.');
    }
    return { kind: 'ready', file: fromTrello(json, file.name) };
  }
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('That file has no rows to import. The first row should name the columns.');
  const header = rows[0].map((h) => h.trim().toUpperCase());
  if (header.includes('TYPE') && header.includes('CONTENT')) return { kind: 'ready', file: fromTodoist(rows, file.name) };
  return { kind: 'csv', name: file.name, rows };
}
