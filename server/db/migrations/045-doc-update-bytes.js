// How big each waiting live change to a doc is, and what a doc's waiting changes add up to, so
// the server can cap them in bytes as well as in number without reading the ciphertext back.
const docUpdateBytes = `
  ALTER TABLE doc_updates ADD COLUMN size INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE docs ADD COLUMN pending_bytes INTEGER NOT NULL DEFAULT 0;
`;

export default docUpdateBytes;
