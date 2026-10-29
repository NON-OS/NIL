export interface Dropped {
  // null for an empty folder, which is made all the same
  file: File | null;
  // the folders it sits in, from the one dropped down
  path: string[];
}

const fileOf = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));
const batchOf = (reader: FileSystemDirectoryReader) => new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));

// What was dropped from the computer: files, and folders with everything in them, each file with
// the folders it sits in. The browser hands over a folder's contents only while the drop is being
// handled, so the entries are taken at once and read after. `most` stops a folder of millions.
export default async function droppedFiles(data: DataTransfer, most: number): Promise<Dropped[]> {
  const items = [...data.items].filter((i) => i.kind === 'file');
  const entries = items.map((i) => i.webkitGetAsEntry?.() ?? null);
  // a browser without folder entries hands over plain files
  if (entries.some((e) => !e)) return [...data.files].map((file) => ({ file, path: [] }));
  const out: Dropped[] = [];
  const walk = async (entry: FileSystemEntry, path: string[]) => {
    if (out.length > most) throw new Error(`That’s more than the ${most} files and folders a shared folder holds.`);
    if (entry.isFile) {
      out.push({ file: await fileOf(entry as FileSystemFileEntry), path });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const inside: FileSystemEntry[] = [];
    // a folder's entries come a batch at a time, until an empty one
    for (let batch = await batchOf(reader); batch.length; batch = await batchOf(reader)) inside.push(...batch);
    const here = [...path, entry.name];
    if (!inside.length) out.push({ file: null, path: here });
    for (const child of inside) await walk(child, here);
  };
  for (const entry of entries) await walk(entry!, []);
  return out;
}
