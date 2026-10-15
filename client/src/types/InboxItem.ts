export default interface InboxItem {
  id: number;
  type: 'assigned' | 'mention' | 'comment' | 'status' | 'due' | 'bounty_paid';
  taskId: string | null;
  actorId: string | null;
  data: Record<string, any>;
  readAt: number | null;
  createdAt: number;
}
