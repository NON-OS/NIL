import type { DragEvent } from 'react';

const ITEM = 'application/x-nil-item';

// Telling drags apart: files from the computer, or files and folders moved inside Nil, which carry
// their ids, comma-separated, under a type of their own.
const fileDrag = {
  ITEM,
  fromComputer: (e: DragEvent) => e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes(ITEM),
  isItem: (e: DragEvent) => e.dataTransfer.types.includes(ITEM),
};

export default fileDrag;
