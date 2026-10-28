// One file on its way into a shared folder, or a zip on its way out of one, as the tray shows it.
export default interface UploadJob {
  id: string;
  kind: 'upload' | 'download';
  name: string;
  size: number;
  folderId: string;
  parentId: string | null;
  // 0 to 1
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'failed' | 'stopped';
  error: string | null;
}
