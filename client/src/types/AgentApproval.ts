// Something an agent asked to do that waits for a person: approving runs it as the agent, on
// the approver's behalf; declining drops it.
export default interface AgentApproval {
  id: string;
  agentId: string;
  taskId: string | null;
  taskKey: string | null;
  runId: string | null;
  actingForId: string | null;
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  reasons: string[];
  status: 'pending' | 'approved' | 'declined' | 'failed' | 'expired';
  decidedBy: string | null;
  decidedAt: number | null;
  result: Record<string, unknown> | null;
  createdAt: number;
}
