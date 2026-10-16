// Connects to Nil's MCP endpoint with the official TypeScript SDK and an access key in the
// Authorization header, the way Claude Code or Cursor would. `sdk` picks the current split
// client package (v2) or the older all-in-one package (v1) that many clients still ship.
export default async function mcpConnect(url, key, { sdk = 'v2', name = 'nil-agents-check' } = {}) {
  let Client;
  let StreamableHTTPClientTransport;
  if (sdk === 'v1') {
    ({ Client } = await import('@modelcontextprotocol/sdk/client/index.js'));
    ({ StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js'));
  } else {
    ({ Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client'));
  }
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: key ? { Authorization: `Bearer ${key}` } : {} },
  });
  const client = new Client({ name, version: '1.0.0' });
  await client.connect(transport);
  return client;
}
