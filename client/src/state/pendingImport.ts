// A file waiting to be imported into a doc that was just made for it, held in this tab's memory
// only until the editor opens the doc and takes it.
const waiting = new Map<string, File>();

const pendingImport = {
  set: (docId: string, file: File) => void waiting.set(docId, file),
  take(docId: string) {
    const file = waiting.get(docId) ?? null;
    waiting.delete(docId);
    return file;
  },
};

export default pendingImport;
