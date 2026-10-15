export default interface Comment {
  id: string;
  taskId: string;
  authorId: string | null;
  body: string;
  createdAt: number;
  editedAt: number | null;
}
