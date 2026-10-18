// One CSV cell. A spreadsheet runs a cell that starts with =, +, - or @ (or a full-width ＝) as a
// formula, and one that reads the file with ; or tab as its list separator splits "x;=1" into a
// second cell that does. Such text gets a harmless apostrophe in front, and every cell is
// quoted, so a separator inside one never starts another.
const FORMULA = /(^|[;\t,])\s*[=+\-@＝]/;

export default function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  const safe = /^[\t\r]/.test(s) || FORMULA.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}
