import type AgentStep from './AgentStep';

// One run of a built-in agent on one task, with its step log when the timeline asks for it.
export default interface AgentRun {
  id: string;
  agentId: string;
  taskId: string | null;
  trigger: string;
  triggers: string[];
  actingForId: string | null;
  status: 'queued' | 'running' | 'done' | 'stopped' | 'failed' | 'canceled';
  attempts: number;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  stepCount: number;
  summary: string | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  steps?: AgentStep[];
}
