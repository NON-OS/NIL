// Which sealed blobs (pictures and files) each version of a doc uses, as the browser that saved
// it declared them. The server can't read a doc, so this is how it learns that a picture was
// taken out of every version it keeps and may go. NULL means nobody said, and then nothing of
// that doc's is ever thrown away.
const docBlobRefs = `
  ALTER TABLE docs ADD COLUMN blob_refs TEXT;
  ALTER TABLE doc_revisions ADD COLUMN blob_refs TEXT;
`;

export default docBlobRefs;
