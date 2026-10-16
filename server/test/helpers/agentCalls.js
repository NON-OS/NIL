// Calls the agent endpoints the way an outside program would: MCP over JSON-RPC and the REST API,
// each with a bearer key and no cookie.
export default function agentCalls(base) {
  let nextId = 1;

  async function mcp(key, method, params) {
    const res = await fetch(`${base()}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  async function tool(key, name, args = {}) {
    const res = await mcp(key, 'tools/call', { name, arguments: args });
    return res.body?.result ?? res.body;
  }

  async function rest(key, method, path, body, headers = {}) {
    const res = await fetch(`${base()}/api/agent/v1${path}`, {
      method,
      headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data, headers: res.headers };
  }

  return { mcp, tool, rest };
}
