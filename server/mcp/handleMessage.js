import HttpError from '../lib/HttpError.js';
import log from '../lib/log.js';
import appVersion from '../lib/appVersion.js';
import publicWorkspace from '../services/publicWorkspace.js';
import tools from './tools.js';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const byName = new Map(tools.map((t) => [t.name, t]));

const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

function listing() {
  return tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { readOnlyHint: !t.write, destructiveHint: false, openWorldHint: false },
  }));
}

function call(params, user, scope) {
  const tool = byName.get(params?.name);
  if (!tool) return { error: [-32602, `Unknown tool: ${params?.name}`] };
  if (tool.write && scope !== 'write') return { result: { isError: true, content: [{ type: 'text', text: 'This key is read-only. Create a key with write access in Nil settings to change things.' }] } };
  try {
    const data = tool.run(params.arguments ?? {}, user, scope);
    return { result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data } };
  } catch (err) {
    // tool failures go back to the model as readable errors, not protocol errors
    const message = err instanceof HttpError ? err.message : 'Something went wrong on the Nil server.';
    if (!(err instanceof HttpError)) log.error('mcp', `The ${params.name} tool failed.`, err);
    return { result: { isError: true, content: [{ type: 'text', text: message }] } };
  }
}

// One Model Context Protocol message in, at most one reply out (notifications get none).
export default function handleMessage(message, user, scope) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return fail(message?.id, -32600, 'Invalid request.');
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;
  if (isNotification) return null;

  switch (method) {
    case 'initialize': {
      const ws = publicWorkspace();
      return reply(id, {
        protocolVersion: VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'nonos', title: 'Nil', version: appVersion },
        instructions: `You are connected to the Nil workspace "${ws?.name}" as ${user.name}. Task keys look like ${ws?.taskPrefix}-12. You see exactly what ${user.name} can see; private tasks of others and encrypted docs are never available. ${scope === 'write' ? 'This key can create and change tasks.' : 'This key is read-only.'}`,
      });
    }
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: listing() });
    case 'tools/call': {
      const out = call(params, user, scope);
      return out.error ? fail(id, ...out.error) : reply(id, out.result);
    }
    default:
      return fail(id, -32601, `Method not supported: ${method}`);
  }
}
