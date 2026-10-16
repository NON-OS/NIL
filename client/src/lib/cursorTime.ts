// The time an archive cursor ("<updatedAt>.<id>") points back to: every closed task touched
// later than this is already loaded.
export default function cursorTime(cursor: string) {
  return Number(cursor.slice(0, cursor.indexOf('.')));
}
