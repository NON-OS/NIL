import actors from './authzActors.js';

const { ALL, PEOPLE } = actors;
const READERS = [...PEOPLE, 'agentRead', 'agentWrite'];

// Rows of the authorization matrix outside the JSON API: health and discovery files, the web
// app's pages, the MCP endpoint and the live connection. The pages are public on purpose; what
// they show comes from the API, which checks every call. "GET /" only exists while the web app
// isn't built, and "GET *" and "GET /sw.js" only once it is.
export default {
  'GET /healthz': { open: true, allow: ALL },
  'GET /.well-known/nonos-proof-key': { open: true, allow: ALL },
  'GET /.well-known/nonos-bounties.json': { open: true, allow: ALL },
  'GET /': { open: true, allow: ALL, web: true, optional: true },
  'GET /sw.js': { open: true, allow: ALL, web: true },
  'GET *': { open: true, allow: ALL, web: true, path: '/tasks/some-task' },
  // MCP takes a bearer key only; GET and the rest answer 405 once the key checks out
  'POST /mcp': { allow: READERS, mcp: true },
  'ALL /mcp': { allow: READERS, mcp: true, ok: [405] },
  'WS /ws': { allow: PEOPLE },
};
