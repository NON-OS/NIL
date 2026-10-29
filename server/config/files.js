import envNumber from '../lib/envNumber.js';
import units from './units.js';

const KB = 1024;

// Files, round two: limits the browser works within when it cleans, previews, zips and re-seals
// files, and that the server holds people to where it can check them. The browser gets them with
// the bootstrap, so a server's operator sets them in one place.
export default Object.freeze({
  // PDFs, images and Word files are decrypted whole into the tab to show them, up to this size;
  // audio and video stream instead, whatever their size
  previewMaxBytes: envNumber('FILES_PREVIEW_MAX_MB', 200, { min: 1 }) * units.MB,
  textPreviewMaxBytes: envNumber('FILES_TEXT_PREVIEW_MAX_KB', 2048, { min: 16 }) * KB,
  // the largest GIF, PDF, Office file or SVG the browser cleans of hidden details, in memory
  cleanMaxBytes: envNumber('FILES_CLEAN_MAX_MB', 200, { min: 1 }) * units.MB,
  // the most a cleaner or a preview unpacks from one compressed part, against zip bombs
  inflateMaxBytes: envNumber('FILES_INFLATE_MAX_MB', 64, { min: 1 }) * units.MB,
  // pictures larger than this are never decoded, against decompression bombs
  imageMaxPixels: envNumber('FILES_IMAGE_MAX_MEGAPIXELS', 100, { min: 1 }) * 1_000_000,
  // a thumbnail's largest encrypted size, so a grid never fetches a large file to show a picture
  thumbMaxBytes: envNumber('FILES_THUMB_MAX_KB', 512, { min: 16 }) * KB,
  // a zip put together in memory, where a browser can't write one to disk as it goes
  zipMemoryMaxBytes: envNumber('FILES_ZIP_MEMORY_MAX_MB', 500, { min: 1 }) * units.MB,
  // how long deleted files and folders stay in their folder's trash before they're gone for good
  trashMs: envNumber('FILES_TRASH_DAYS', 30, { min: 1 }) * 24 * units.HOUR,
  // how deep folders inside a shared folder may nest
  depthMax: envNumber('FOLDER_DEPTH_MAX', 32, { min: 1, max: 256 }),
  // re-sealing after someone is taken out: how many files one browser takes on at a time, and how
  // long they're its own before another browser may take them over
  resealBatch: envNumber('FILES_RESEAL_BATCH', 20, { min: 1, max: 500 }),
  resealLeaseMs: envNumber('FILES_RESEAL_LEASE_MINUTES', 10, { min: 1 }) * units.MINUTE,
  // fresh copies one person may start in an hour while re-sealing; each must stand in for a file
  // that's waiting, so this only paces a large folder
  resealCopiesPerHour: envNumber('FILES_RESEAL_COPIES_PER_HOUR', 20000, { min: 1 }),
  // the rest of what one person may do in a minute: hand folders to people (a team folder tells
  // the whole team), delete things, finish uploads (each checks every chunk on disk) and take or
  // swap in items being re-sealed. A bulk move or delete names at most FILES_BULK_MAX items.
  grantsPerMinute: envNumber('FILES_GRANTS_PER_MINUTE', 30, { min: 1 }),
  deletesPerMinute: envNumber('FILES_DELETES_PER_MINUTE', 120, { min: 1 }),
  finishesPerMinute: envNumber('SEALED_FINISHES_PER_MINUTE', 300, { min: 1 }),
  resealsPerMinute: envNumber('FILES_RESEALS_PER_MINUTE', 600, { min: 1 }),
  bulkMax: envNumber('FILES_BULK_MAX', 500, { min: 1, max: 5000 }),
});
