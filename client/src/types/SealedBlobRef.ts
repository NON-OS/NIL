// What it takes to open a sealed blob, kept wherever the file is used (inside a doc, or in a
// folder's sealed details): the blob's id on the server and its key, never sent there. The rest
// describes the file as uploaded: an image's details were removed and its size and pixel
// dimensions are those of the cleaned copy.
export default interface SealedBlobRef {
  blob: string;
  // base64url of a fresh 32-byte key
  key: string;
  mime: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
}
