import type AgentRunner from './AgentRunner';
import type Status from './Status';

// What the Add agent and edit forms send. Empty limits fall back to the workspace defaults; an
// API key is sent only when it's set or cleared, never read back.
export default interface AgentInput {
  name: string;
  color: string;
  description: string;
  instructions: string;
  access: 'read' | 'write';
  allProjects: boolean;
  projectIds: string[];
  tools: string[];
  runner: AgentRunner;
  model: string;
  endpoint: string;
  apiKey?: string;
  doneStatus: Status | 'none' | null;
  maxSteps: number | null;
  maxRunTokens: number | null;
  maxDayTokens: number | null;
  rateLimit: number | null;
  priceIn: number | null;
  priceOut: number | null;
}
