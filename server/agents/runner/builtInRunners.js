// How an agent can run inside Nil: on Anthropic's API through the official SDK, or on any
// OpenAI-compatible chat completions endpoint (a local model, or a hosted one). Every other
// agent is external and connects over MCP or the REST API.
const builtInRunners = Object.freeze(['anthropic', 'openai']);

export default builtInRunners;
