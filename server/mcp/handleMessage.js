import appVersion from '../lib/appVersion.js';
import publicWorkspace from '../services/publicWorkspace.js';
import runTool from '../agents/runTool.js';
import pendingText from '../agents/pendingText.js';
import pendingBody from '../agents/pendingBody.js';
import tools from './tools.js';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];

const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

// People see every tool and get a readable refusal when their key can't use one. An agent sees
// only the tools an admin gave it, and only the read tools when it is read-only.
function listing({ agent, scope }) {
  return tools
    .filter((t) => !agent || (agent.tools.includes(t.name) && (!t.write || scope === 'write')))
    .map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { readOnlyHint: !t.write && !t.mutates, destructiveHint: Boolean(t.destructive), openWorldHint: false },
    }));
}

function instructions({ user, scope, agent }) {
  const ws = publicWorkspace();
  const access = scope === 'write' ? 'This key can create and change tasks.' : 'This key is read-only.';
  if (!agent) {
    return `You are connected to the Nil workspace "${ws?.name}" as ${user.name}. Task keys look like ${ws?.taskPrefix}-12. You see exactly what ${user.name} can see; private tasks of others and encrypted docs are never available. ${access}`;
  }
  return `You are the agent "${agent.name}" in the Nil workspace "${ws?.name}". Task keys look like ${ws?.taskPrefix}-12. You see the tasks in your projects and the tasks assigned to you. Private tasks and docs are end-to-end encrypted for people: you can never see or read them. Changes outside your projects, deleting, cancelling, giving work to people and bulk changes wait for a person's approval. ${access}`;
}

function call(params, principal) {
  const out = runTool(principal, params?.name, params?.arguments ?? {}, { via: 'mcp' });
  if (out.ok) return { content: [{ type: 'text', text: JSON.stringify(out.data, null, 2) }], structuredContent: out.data };
  if (out.pending) return { content: [{ type: 'text', text: pendingText(out.pending) }], structuredContent: pendingBody(out.pending) };
  // tool failures go back to the model as readable errors, not protocol errors
  return { isError: true, content: [{ type: 'text', text: out.error.message }] };
}

// One Model Context Protocol message in, at most one reply out (notifications get none).
export default function handleMessage(message, principal) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return fail(message?.id, -32600, 'Invalid request.');
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;
  if (isNotification) return null;

  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'nonos', title: 'Nil', version: appVersion },
        instructions: instructions(principal),
      });
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: listing(principal) });
    case 'tools/call': {
      if (!tools.some((t) => t.name === params?.name)) return fail(id, -32602, `Unknown tool: ${params?.name}`);
      return reply(id, call(params, principal));
    }
    default:
      return fail(id, -32601, `Method not supported: ${method}`);
  }
}
