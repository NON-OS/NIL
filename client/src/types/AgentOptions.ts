import type Status from './Status';

// What the Add agent form can offer, from the server: the tool list, webhook events and the
// workspace defaults an empty limit falls back to. Admins only.
export default interface AgentOptions {
  tools: { name: string; title: string; description: string; write: boolean }[];
  events: string[];
  anthropicAvailable: boolean;
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
