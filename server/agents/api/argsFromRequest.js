import HttpError from '../../lib/HttpError.js';

// Query strings carry only text, so values are read as the type the tool's schema expects.
function fromQuery(schema, name, raw) {
  const value = Array.isArray(raw) ? raw : String(raw);
  switch (schema?.type) {
    case 'integer':
    case 'number':
      if (!/^-?\d+(\.\d+)?$/.test(value)) throw HttpError.badRequest(`${name}: expected a number.`);
      return Number(value);
    case 'boolean':
      if (!['true', 'false', '1', '0'].includes(value)) throw HttpError.badRequest(`${name}: expected true or false.`);
      return value === 'true' || value === '1';
    case 'array':
      return (Array.isArray(value) ? value : value.split(',')).map((v) => fromQuery(schema.items, name, v));
    default:
      if (Array.isArray(value)) throw HttpError.badRequest(`${name}: give it once.`);
      return value;
  }
}

// One tool's arguments from an HTTP request: path parameters, then the query string for GET or
// the JSON body otherwise. Path parameters win, so a body can't retarget the URL's task.
export default function argsFromRequest(tool, req) {
  const props = tool.inputSchema.properties ?? {};
  let args = {};
  if (tool.http.method === 'GET') {
    for (const [name, raw] of Object.entries(req.query)) args[name] = fromQuery(props[name], name, raw);
  } else {
    const body = req.body ?? {};
    if (typeof body !== 'object' || Array.isArray(body)) throw HttpError.badRequest('The request body must be a JSON object.');
    args = { ...body };
  }
  return { ...args, ...req.params };
}
