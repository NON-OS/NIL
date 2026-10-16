import CodeSnippet from './CodeSnippet';

// Hosts Anthropic's cloud can't reach: Claude's custom connectors need a public https address.
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)|\.(onion|local|internal)$/;

// How to plug an external agent in: over MCP (Claude Code, Cursor, VS Code, Claude's custom
// connectors) or over the REST API that function-calling frameworks read from the OpenAPI
// document. Files that might be shared hold an environment variable, never the key itself.
export default function ConnectGuide({ name, token }: { name: string; token: string | null }) {
  const origin = location.origin;
  const key = token ?? 'nonos_agt_…';
  const server = `nil-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent'}`;
  const url = `${origin}/mcp`;
  const reachable = location.protocol === 'https:' && !PRIVATE_HOST.test(location.hostname);
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <CodeSnippet label="Claude Code" text={`claude mcp add --transport http ${server} ${url} \\\n  --header "Authorization: Bearer ${key}"`} />
      <CodeSnippet label="Claude Code, shared in a project (.mcp.json, key in NIL_AGENT_KEY)" text={json({ mcpServers: { [server]: { type: 'http', url, headers: { Authorization: 'Bearer ${NIL_AGENT_KEY}' } } } })} />
      <CodeSnippet label="Cursor (.cursor/mcp.json, key in NIL_AGENT_KEY)" text={json({ mcpServers: { [server]: { url, headers: { Authorization: 'Bearer ${env:NIL_AGENT_KEY}' } } } })} />
      <CodeSnippet
        label="VS Code (.vscode/mcp.json, asks for the key)"
        text={json({ inputs: [{ type: 'promptString', id: 'nil-agent-key', description: 'Nil agent key', password: true }], servers: { [server]: { type: 'http', url, headers: { Authorization: 'Bearer ${input:nil-agent-key}' } } } })}
      />
      <p className="muted" style={{ margin: 0 }}>
        <strong>Claude app and claude.ai:</strong> Customize → Connectors → Add custom connector, with {url}, No sign in, and a request header <code>Authorization: Bearer {key}</code>.{' '}
        {reachable ? 'Claude connects from Anthropic’s cloud, so the server has to stay reachable on the internet.' : 'Claude connects from Anthropic’s cloud and can’t reach this address. Use Claude Code, or put Nil on a public https address.'}
      </p>
      <p className="muted" style={{ margin: 0 }}>
        <strong>ChatGPT:</strong> its custom MCP servers sign in with OAuth or nothing, with no place for a key, so it can’t connect here. Use the REST API with the OpenAI Agents SDK instead.
      </p>
      <CodeSnippet label="REST API (OpenAI Agents SDK, LangChain, CrewAI, your own code)" text={`# the operations and their schemas\ncurl ${origin}/api/agent/v1/openapi.json\n\n# what's assigned to this agent\ncurl -H "Authorization: Bearer ${key}" ${origin}/api/agent/v1/me/assignments`} />
    </div>
  );
}
