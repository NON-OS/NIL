export default interface Activity {
  id: number;
  taskId: string | null;
  actorId: string | null;
  // when an agent made the change, the person it was acting for
  actingForId?: string | null;
  type: string;
  data: Record<string, any>;
  createdAt: number;
}
