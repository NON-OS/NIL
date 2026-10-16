export default interface WebhookDelivery {
  id: string;
  event: string;
  payload: Record<string, unknown> | null;
  status: 'pending' | 'sending' | 'held' | 'delivered' | 'failed' | 'canceled';
  attempts: number;
  nextAttemptAt: number | null;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: number;
  deliveredAt: number | null;
}
