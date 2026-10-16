// The ordinary tables of the main database: the ones that hold rows we own. Full-text indexes
// (virtual tables) and their shadow tables are left out on purpose. Their rows follow from the
// ordinary tables through triggers, and writing to a shadow table directly corrupts the index.
export default function dataTables(db) {
  return db
    .prepare("SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((t) => t.name);
}
