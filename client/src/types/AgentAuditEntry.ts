// One line of an agent's audit trail: a tool call it made, or a change an admin made to it.
export default interface AgentAuditEntry {
  id: number;
  actorId: string | null;
  actingForId: string | null;
  via: 'mcp' | 'rest' | 'runner' | 'approval' | 'admin';
  action: string;
  taskId: string | null;
  runId: string | null;
  outcome: 'ok' | 'error' | 'denied' | 'pending_approval';
  detail: Record<string, unknown>;
  createdAt: number;
}
