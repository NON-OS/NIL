// One CSV cell. A leading =, +, - or @ would run as a formula when the file is opened in a
// spreadsheet, so those get a harmless apostrophe in front.
export default function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
