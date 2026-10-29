// Who sent each waiting live change and how big it is, so what someone typed but nobody has
// folded into a version yet counts against their file space without reading the table through.
const docUpdateAuthors = `
  CREATE INDEX doc_updates_by ON doc_updates(created_by, size);
`;

export default docUpdateAuthors;
