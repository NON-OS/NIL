// A client built only from Nil's OpenAPI document: every operation becomes call(operationId,
// args), and any subset can be handed to a model as function-calling tools. Nothing about the
// API is hard-coded here, so this also checks that the document is complete enough to use.
export default async function openapiClient(specUrl, { key, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(specUrl);
  if (res.status !== 200) throw new Error(`OpenAPI document: HTTP ${res.status}`);
  const spec = await res.json();
  const server = spec.servers[0].url;
  const refs = spec.components?.parameters ?? {};
  const ops = new Map();

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const params = (op.parameters ?? []).map((p) => (p.$ref ? refs[p.$ref.split('/').pop()] : p));
      const body = op.requestBody?.content?.['application/json']?.schema ?? null;
      ops.set(op.operationId, { path, method: method.toUpperCase(), op, params, body });
    }
  }

  async function call(operationId, args = {}, { idempotencyKey, headers = {}, auth = key } = {}) {
    const entry = ops.get(operationId);
    if (!entry) throw new Error(`No operation ${operationId} in the OpenAPI document`);
    const rest = { ...args };
    let url = entry.path;
    const query = new URLSearchParams();
    for (const p of entry.params) {
      if (p.in === 'path') {
        if (rest[p.name] === undefined) throw new Error(`${operationId}: missing path parameter ${p.name}`);
        url = url.replace(`{${p.name}}`, encodeURIComponent(String(rest[p.name])));
        delete rest[p.name];
      } else if (p.in === 'query' && rest[p.name] !== undefined) {
        query.set(p.name, Array.isArray(rest[p.name]) ? rest[p.name].join(',') : String(rest[p.name]));
        delete rest[p.name];
      }
    }
    const qs = query.toString();
    const hasBody = entry.method !== 'GET' && entry.method !== 'DELETE' && Object.keys(rest).length > 0;
    const response = await fetchImpl(`${server}${url}${qs ? `?${qs}` : ''}`, {
      method: entry.method,
      headers: {
        Accept: 'application/json',
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...headers,
      },
      body: hasBody ? JSON.stringify(rest) : undefined,
    });
    const text = await response.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: response.status, data, headers: response.headers, declared: Object.keys(entry.op.responses).includes(String(response.status)) };
  }

  // Function-calling tools for an OpenAI-compatible model, named by operationId.
  function tools(names = [...ops.keys()]) {
    return names.map((name) => {
      const { op, params, body } = ops.get(name);
      const properties = {};
      const required = [];
      for (const p of params) {
        if (p.in !== 'path' && p.in !== 'query') continue;
        properties[p.name] = { ...p.schema, ...(p.description ? { description: p.description } : {}) };
        if (p.required) required.push(p.name);
      }
      Object.assign(properties, body?.properties ?? {});
      required.push(...(body?.required ?? []));
      return { type: 'function', function: { name, description: op.description ?? op.summary, parameters: { type: 'object', properties, required } } };
    });
  }

  return { spec, server, operations: ops, call, tools };
}
