import type { DragEvent } from 'react';
import toast from '../state/toast';

const ITEM = 'application/x-nil-item';

// Telling drags apart: files from the computer, or a file or folder moved inside Nil, which
// carries its id under a type of its own.
const fileDrag = {
  ITEM,
  fromComputer: (e: DragEvent) => e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes(ITEM),
  isItem: (e: DragEvent) => e.dataTransfer.types.includes(ITEM),

  // The files dropped from the computer. Folders are left out with a word about it, since only
  // files go up one by one.
  files(e: DragEvent) {
    const items = [...e.dataTransfer.items].filter((i) => i.kind === 'file');
    const isFolder = (i: DataTransferItem) => Boolean(i.webkitGetAsEntry?.()?.isDirectory);
    if (items.some(isFolder)) toast.show('Folders can’t be dropped in yet. Open the folder on your computer and drop the files inside it.');
    return items.filter((i) => !isFolder(i)).map((i) => i.getAsFile()).filter((f): f is File => Boolean(f));
  },
};

export default fileDrag;
