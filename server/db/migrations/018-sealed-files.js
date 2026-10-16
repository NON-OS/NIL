// Files on private tasks, encrypted in the browser. `sealed` holds the file's own seal id, the
// task seal it was encrypted under, its name and type encrypted, and its key wrapped under the
// task's key. The stored bytes are ciphertext, kept under a name and type that say nothing.
const sealedFiles = `
  ALTER TABLE attachments ADD COLUMN sealed TEXT;
`;

export default sealedFiles;
