export interface DiskWriter {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}
type SavePicker = (options: { suggestedName: string }) => Promise<{ createWritable(): Promise<DiskWriter> }>;

// Where the browser lets a page write a file to disk in pieces (Chrome, Edge and the like): asks
// where to save `name` and returns the writer for it. Null where the browser can't, and
// 'cancelled' when the person closed the dialog. Call it straight from a click, before anything
// slow, since the browser asks only right after one.
export default async function pickSaveFile(name: string): Promise<DiskWriter | null | 'cancelled'> {
  const pick = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (!pick) return null;
  try {
    return await (await pick({ suggestedName: name })).createWritable();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    throw err;
  }
}
