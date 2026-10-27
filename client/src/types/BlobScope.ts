// Where a sealed blob belongs, which decides who may upload it and fetch it back: anyone holding
// a key to the doc, or to the shared folder.
type BlobScope = { kind: 'doc'; id: string } | { kind: 'folder'; id: string };

export default BlobScope;
