// A finished sealed blob as the server describes it: how many chunks it has, its whole size
// encrypted, and its header (format version and nonce prefix, base64url).
export default interface BlobInfo {
  id: string;
  chunks: number;
  size: number;
  header: string;
}
