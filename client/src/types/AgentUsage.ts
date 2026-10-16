interface UsageWindow {
  input: number;
  output: number;
  // estimated, in US dollars, from the agent's prices per million tokens
  cost: number;
  runs: number;
  failed: number;
  apiCalls: number;
}

export default interface AgentUsage {
  today: UsageWindow;
  last30Days: UsageWindow;
}
