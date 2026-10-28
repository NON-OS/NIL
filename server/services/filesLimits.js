import config from '../config.js';

// What a member's browser holds itself to in Files and with files in docs: the largest file,
// how much it decrypts whole for a preview, cleans or unpacks in memory, the largest picture it
// decodes and thumbnail it takes, the largest zip it builds in memory, how deep folders nest, how
// many items a shared folder holds, how many one move or delete names, how long an unfinished upload is kept to carry on with, and
// how long something deleted stays in its folder's trash.
export default function filesLimits() {
  const { files, sealedBlobs } = config;
  return {
    maxFileBytes: sealedBlobs.maxFileBytes,
    previewMaxBytes: files.previewMaxBytes,
    textPreviewMaxBytes: files.textPreviewMaxBytes,
    cleanMaxBytes: files.cleanMaxBytes,
    inflateMaxBytes: files.inflateMaxBytes,
    imageMaxPixels: files.imageMaxPixels,
    thumbMaxBytes: files.thumbMaxBytes,
    zipMemoryMaxBytes: files.zipMemoryMaxBytes,
    depthMax: files.depthMax,
    folderItemsMax: sealedBlobs.folderItemsMax,
    bulkMax: files.bulkMax,
    uploadIdleMs: sealedBlobs.idleMs,
    trashMs: files.trashMs,
  };
}
