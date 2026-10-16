// Picks the delimiter the header line uses most, outside quotes: comma, semicolon (spreadsheets
// in many European locales) or tab.
function delimiterOf(text: string) {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch]++;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
  }
  const [best, seen] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return seen ? best : ',';
}

// RFC 4180 CSV: quoted fields with doubled quotes inside, line breaks inside quotes, CRLF or
// LF endings and a byte order mark. Rows that are completely empty are dropped.
export default function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const delimiter = delimiterOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) endField();
    else if (ch === '\n') endRow();
    else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}
