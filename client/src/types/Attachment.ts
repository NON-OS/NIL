import type SealedFile from './SealedFile';

export default interface Attachment {
  id: string;
  taskId: string;
  uploaderId: string | null;
  // for a file on a private task, the real name and type once this browser has opened `sealed`
  filename: string;
  mime: string;
  // stored bytes, which for an encrypted file include its IV and tag
  size: number;
  sealed: SealedFile | null;
  // set in the browser: true while an encrypted file can't be opened here
  locked?: boolean;
  // set in the browser once an encrypted file is open: whether its details are in the older
  // format nobody signed, and the fingerprint of an earlier key of the uploader's that signed them
  olderFormat?: boolean;
  oldKey?: string | null;
  createdAt: number;
}
