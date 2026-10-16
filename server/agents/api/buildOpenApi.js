import appVersion from '../../lib/appVersion.js';
import tools from '../../mcp/tools.js';

const TAGS = { me: 'You', tasks: 'Tasks', time: 'Time', approvals: 'Approvals' };
const ERRORS = {
  400: 'The arguments are missing or wrong.',
  401: 'The key is missing, wrong, revoked or expired.',
  402: 'The workspace’s Nil Pro subscription has lapsed.',
  403: 'Not allowed: a read-only key, a tool the agent may not use, or a paused agent.',
  404: 'No such task or item, or not one this key can see.',
  409: 'Conflict: already decided, already owned, or an Idempotency-Key reused for a different request.',
  429: 'Over the rate limit. Wait for the number of seconds in Retry-After.',
  503: 'An admin has switched off all agents in this workspace.',
};

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ 'application/json': { schema } });
const pathParams = (path) => [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

function operation(tool) {
  const { method, path, status = 200 } = tool.http;
  const inPath = pathParams(path);
  const props = tool.inputSchema.properties ?? {};
  const required = tool.inputSchema.required ?? [];
  const parameters = inPath.map((name) => ({ name, in: 'path', required: true, schema: props[name], description: props[name]?.description }));
  const op = {
    operationId: tool.name,
    summary: tool.title,
    description: tool.description,
    tags: [TAGS[path.split('/')[1]] ?? 'Workspace'],
    parameters,
    responses: {
      [status]: { description: 'Done.', content: json(ref('Result')) },
      ...Object.fromEntries(Object.entries(ERRORS).map(([code, description]) => [code, { description, content: json(ref('Error')) }])),
    },
    'x-nil-write': Boolean(tool.write),
  };
  const rest = Object.fromEntries(Object.entries(props).filter(([name]) => !inPath.includes(name)));
  if (method === 'GET') {
    for (const [name, schema] of Object.entries(rest)) parameters.push({ name, in: 'query', required: required.includes(name), schema, description: schema.description });
  } else {
    parameters.push({ $ref: '#/components/parameters/IdempotencyKey' });
    if (Object.keys(rest).length) {
      const body = { type: 'object', properties: rest, additionalProperties: false };
      const needed = required.filter((name) => !inPath.includes(name));
      if (needed.length) body.required = needed;
      op.requestBody = { required: needed.length > 0, content: json(body) };
    }
    if (tool.write) op.responses[202] = { description: 'Waiting for a person to approve it. Nothing has changed yet.', content: json(ref('PendingApproval')) };
  }
  return [path, method.toLowerCase(), op];
}

// The OpenAPI 3.1 document for /api/agent/v1, built from the same tool list MCP serves, so the
// two can never disagree. Operation ids are the MCP tool names.
export default function buildOpenApi(serverUrl) {
  const paths = {};
  for (const [path, method, op] of tools.map(operation)) paths[path] = { ...paths[path], [method]: op };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Nil agent API',
      version: `1.0.0+nil.${appVersion}`,
      description: [
        'The tools of the Nil MCP server as a plain HTTP API, for agent frameworks that use function calling.',
        'Authenticate with "Authorization: Bearer <key>": an agent key (nonos_agt_…) from Settings → Agents, or a personal access key (nonos_pat_…) from Settings → Connect AI.',
        'Writes accept an Idempotency-Key header: the same key with the same request returns the first response instead of changing anything twice.',
        'Errors are JSON: {"error": {"code", "message", "status"}}. Rate limits are per agent; responses carry RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset.',
        'Private tasks and docs are end-to-end encrypted for people: no key can read them through this API.',
      ].join('\n\n'),
    },
    servers: [{ url: serverUrl }],
    security: [{ bearer: [] }],
    tags: [...new Set(Object.values(paths).flatMap((ops) => Object.values(ops).flatMap((op) => op.tags)))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'nonos_agt_… or nonos_pat_…' } },
      parameters: {
        IdempotencyKey: { name: 'Idempotency-Key', in: 'header', required: false, description: 'Any unique string up to 200 printable characters. Kept for a day.', schema: { type: 'string', maxLength: 200 } },
      },
      schemas: {
        Result: { type: 'object', description: 'The tool’s result. Same shape as the MCP tool’s structured content.', additionalProperties: true },
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'status'],
              properties: { code: { type: 'string', examples: ['not_found', 'read_only', 'invalid_arguments'] }, message: { type: 'string' }, status: { type: 'integer' } },
            },
          },
        },
        PendingApproval: {
          type: 'object',
          required: ['status', 'approval'],
          properties: {
            status: { const: 'pending_approval' },
            approval: {
              type: 'object',
              required: ['id', 'summary', 'reasons'],
              properties: { id: { type: 'string' }, summary: { type: 'string' }, reasons: { type: 'array', items: { type: 'string' } }, task: { type: ['string', 'null'] } },
            },
          },
        },
      },
    },
  };
}
