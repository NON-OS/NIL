import type ImportItem from './ImportItem';

// A file read in the browser and turned into tasks, ready to preview and match up.
export default interface ImportFile {
  source: 'todoist' | 'trello' | 'csv';
  name: string;
  items: ImportItem[];
  // rows or cards that weren't tasks or were left out (archived cards, sections, blank lines)
  skipped: number;
}
