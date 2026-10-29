// Live editing of docs. Each row is one encrypted, signed change to a doc, numbered in the order
// the server took it. When a browser saves a new version that folds the changes in, the rows it
// covers go. The server can't read them, only count and order them. Each doc keeps its own count,
// so numbers carry on after the rows are folded away, and remembers how far its newest version reaches.
const docUpdates = `
  ALTER TABLE docs ADD COLUMN update_seq INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE docs ADD COLUMN updates_through INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE doc_updates (
    doc_id TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    update_ct TEXT NOT NULL,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (doc_id, seq)
  ) WITHOUT ROWID;
`;

export default docUpdates;
