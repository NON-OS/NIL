export default interface InboxItem {
  id: number;
  type: 'assigned' | 'mention' | 'comment' | 'status' | 'due' | 'bounty_paid' | 'proposal' | 'reminder' | 'application' | 'due_soon' | 'due_today' | 'plan_ending' | 'holder_low';
  taskId: string | null;
  actorId: string | null;
  data: Record<string, any>;
  readAt: number | null;
  createdAt: number;
}
