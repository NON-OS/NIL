export default interface InboxItem {
  id: number;
  type: 'assigned' | 'mention' | 'comment' | 'status' | 'due' | 'bounty_paid' | 'proposal' | 'reminder' | 'application' | 'due_soon' | 'due_today' | 'plan_ending' | 'holder_low' | 'billing_stalled' | 'sign_in_reset' | 'agent_approval' | 'agent_webhook_off' | 'doc_mention';
  taskId: string | null;
  actorId: string | null;
  data: Record<string, any>;
  readAt: number | null;
  createdAt: number;
}
