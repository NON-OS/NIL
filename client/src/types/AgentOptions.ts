import type Status from './Status';

// What the Add agent form can offer, from the server: the tool list, webhook events and the
// workspace defaults an empty limit falls back to. Admins only.
export default interface AgentOptions {
  tools: { name: string; title: string; description: string; write: boolean }[];
  events: string[];
  anthropicAvailable: boolean;
  allowLocalEndpoints: boolean;
  webhookToleranceSeconds: number;
  defaults: {
    model: string;
    doneStatus: Status | 'none';
    maxSteps: number;
    maxRunTokens: number;
    maxDayTokens: number;
    rateLimit: number;
    priceIn: number;
    priceOut: number;
  };
}
