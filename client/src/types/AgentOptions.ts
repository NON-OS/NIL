import type Status from './Status';
import type AiProviderSummary from './AiProviderSummary';

// What the Add agent form can offer, from the server: the tool list, webhook events and the
// workspace defaults an empty limit falls back to. Admins only.
export default interface AgentOptions {
  tools: { name: string; title: string; description: string; write: boolean }[];
  events: string[];
  // Claude works without a key of the agent's own: the workspace's provider is Anthropic, or the
  // server has a default key
  anthropicAvailable: boolean;
  // the workspace's own AI provider, which an agent on "this workspace's AI" uses
  workspaceProvider: AiProviderSummary | null;
  allowLocalEndpoints: boolean;
  // false on a server with no route out: no OpenAI-compatible built-in agents and no webhooks
  outbound: boolean;
  webhookToleranceSeconds: number;
  defaults: {
    // null when the server sets no AGENT_MODEL: a built-in agent on Anthropic then needs its own
    model: string | null;
    doneStatus: Status | 'none';
    maxSteps: number;
    maxRunTokens: number;
    maxDayTokens: number;
    rateLimit: number;
    priceIn: number | null;
    priceOut: number | null;
  };
}
