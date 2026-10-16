import CodeSnippet from './CodeSnippet';

// How to plug an external agent in: over MCP (Claude Desktop, Claude Code and other MCP clients)
// or over the REST API that function-calling frameworks read from the OpenAPI document.
export default function ConnectGuide({ name, token }: { name: string; token: string | null }) {
  const origin = location.origin;
  const key = token ?? 'nonos_agt_…';
  const server = `nil-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent'}`;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <CodeSnippet label="Claude Code" text={`claude mcp add --transport http ${server} ${origin}/mcp \\\n  --header "Authorization: Bearer ${key}"`} />
      <CodeSnippet label="Claude Desktop or any MCP client" text={JSON.stringify({ mcpServers: { [server]: { type: 'http', url: `${origin}/mcp`, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)} />
      <CodeSnippet label="REST API (OpenAI Agents SDK, LangChain, CrewAI, your own code)" text={`# the operations and their schemas\ncurl ${origin}/api/agent/v1/openapi.json\n\n# what's assigned to this agent\ncurl -H "Authorization: Bearer ${key}" ${origin}/api/agent/v1/me/assignments`} />
    </div>
  );
}
