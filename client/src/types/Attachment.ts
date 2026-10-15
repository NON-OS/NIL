export default interface Attachment {
  id: string;
  taskId: string;
  uploaderId: string | null;
  filename: string;
  mime: string;
  size: number;
  createdAt: number;
}
