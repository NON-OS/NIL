// How an agent runs: connected from outside over MCP or the REST API, or inside Nil on the
// workspace's own AI provider (Settings → Connect AI), on Anthropic's API, or on an
// OpenAI-compatible endpoint (a local model, for example).
type AgentRunner = 'external' | 'workspace' | 'anthropic' | 'openai';
export default AgentRunner;
