// How an agent runs: connected from outside over MCP or the REST API, or inside Nil on
// Anthropic's API or an OpenAI-compatible endpoint (a local model, for example).
type AgentRunner = 'external' | 'anthropic' | 'openai';
export default AgentRunner;
