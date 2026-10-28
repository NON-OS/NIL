// What the server holds Files to, and the browser holds itself to, as set by whoever runs it (see
// server/config/files.js): sizes in bytes, times in milliseconds.
export default interface FilesLimits {
  maxFileBytes: number;
  previewMaxBytes: number;
  textPreviewMaxBytes: number;
  cleanMaxBytes: number;
  inflateMaxBytes: number;
  imageMaxPixels: number;
  thumbMaxBytes: number;
  zipMemoryMaxBytes: number;
  depthMax: number;
  folderItemsMax: number;
  uploadIdleMs: number;
  trashMs: number;
}
