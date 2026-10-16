export default interface Activity {
  id: number;
  taskId: string | null;
  actorId: string | null;
  type: string;
  data: Record<string, any>;
  createdAt: number;
}
