// How an agent can run inside Nil: on the workspace's own AI provider (Settings → Connect AI), on
// Anthropic's API through the official SDK, or on any OpenAI-compatible chat completions endpoint
// (a local model, or a hosted one). Every other agent is external and connects over MCP or the
// REST API.
const builtInRunners = Object.freeze(['workspace', 'anthropic', 'openai']);

export default builtInRunners;
