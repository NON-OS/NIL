import { useEffect, useState } from 'react';
import fileBytes from '../actions/fileBytes';
import isImage from '../lib/isImage';
import type Attachment from '../types/Attachment';
import type Task from '../types/Task';

// A decrypted image from a private task as a blob: URL, alive only while the component showing
// it is mounted. Only the image types an <img> can't run script from ever get one.
export default function useFilePreview(task: Task, file: Attachment) {
  const [url, setUrl] = useState<string | null>(null);
  const previewable = file.locked === false && isImage(file);

  useEffect(() => {
    if (!previewable) return;
    let live = true;
    let made: string | null = null;
    fileBytes(task, file)
      .then((bytes) => {
        if (!live) return;
        made = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
      setUrl(null);
    };
    // the task and file objects are new on every store change; a new key or type is what matters
  }, [previewable, file.id, file.mime, file.sealed?.key]);

  return url;
}
