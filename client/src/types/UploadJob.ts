// One file on its way into a shared folder, as the upload tray shows it.
export default interface UploadJob {
  id: string;
  name: string;
  size: number;
  folderId: string;
  parentId: string | null;
  // 0 to 1
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'failed' | 'stopped';
  error: string | null;
}
