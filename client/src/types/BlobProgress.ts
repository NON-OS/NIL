// What every upload and download of a sealed blob can take: a callback that hears how far it
// has got, from 0 to 1, and a signal that stops it.
export default interface BlobProgress {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}
