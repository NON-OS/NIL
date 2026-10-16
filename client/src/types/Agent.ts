import type AgentRunner from './AgentRunner';
import type AgentUsage from './AgentUsage';
import type Status from './Status';

// An agent as Settings → Agents shows it. Members get the first block; admins get the rest too.
// Secrets (keys, webhook secrets, model API keys) are never sent back after they're created.
export default interface Agent {
  id: string;
  name: string;
  color: string;
  description: string;
  access: 'read' | 'write';
  allProjects: boolean;
  projectIds: string[];
  runner: AgentRunner;
  model: string | null;
  endpointHost: string | null;
  pausedAt: number | null;
  createdAt: number;

  instructions?: string;
  tools?: string[];
  endpoint?: string | null;
  hasApiKey?: boolean;
  doneStatus?: Status | 'none';
  limits?: { maxSteps: number; maxRunTokens: number; maxDayTokens: number; rateLimit: number };
  // null until the agent (or the server, for Anthropic) has prices
  price?: { in: number; out: number } | null;
  overrides?: {
    doneStatus: Status | 'none' | null;
    maxSteps: number | null;
    maxRunTokens: number | null;
    maxDayTokens: number | null;
    rateLimit: number | null;
    priceIn: number | null;
    priceOut: number | null;
  };
  key?: { createdAt: number; lastUsedAt: number | null } | null;
  webhook?: { url: string; events: string[]; failures: number; disabledAt: number | null; disabledReason: string | null; createdAt: number } | null;
  pendingApprovals?: number;
  usage?: AgentUsage;
}
