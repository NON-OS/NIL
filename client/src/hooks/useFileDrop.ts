import { useEffect, useRef, useState, type DragEvent } from 'react';
import isEditable from '../lib/isEditable';
import fileDrag from '../lib/fileDrag';

// Files from the computer, dragged onto the page or pasted, go to `onFiles`. Moving a file inside
// Nil is a drag of another kind, left to the tiles and rows.
export default function useFileDrop(onFiles: (files: File[]) => void, enabled: boolean) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const latest = useRef(onFiles);
  latest.current = onFiles;

  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length || isEditable(e.target)) return;
      e.preventDefault();
      latest.current(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [enabled]);

  const zone = {
    onDragEnter: (e: DragEvent) => {
      if (!enabled || !fileDrag.fromComputer(e)) return;
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!enabled || !fileDrag.fromComputer(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!fileDrag.fromComputer(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      depth.current = 0;
      setDragging(false);
      if (!enabled || !fileDrag.fromComputer(e)) return;
      e.preventDefault();
      const files = fileDrag.files(e);
      if (files.length) latest.current(files);
    },
  };
  return { dragging, zone };
}
