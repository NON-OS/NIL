import actors from './authzActors.js';

const { ALL, PEOPLE } = actors;
const READERS = [...PEOPLE, 'agentRead', 'agentWrite'];
const WRITERS = [...PEOPLE, 'agentWrite'];
const key = ({ t }) => t.taskKey;
const freshKey = async ({ t, world }) => {
  const id = await t.fresh.task();
  return `${t.prefix}-${(await world.people.member('GET', `/api/tasks/${id}/detail`)).data.task.number}`;
};

// Rows of the authorization matrix for the agent REST API, which takes a bearer key and never a
// cookie: people call it with their own personal key, agents with theirs. MCP runs the same
// tools, so the matrix checks each MCP tool against the row of its REST twin. An agent's change
// that needs a person's approval answers 202 with an approval card instead of acting.
export default {
  'GET /api/agent/v1/openapi.json': { open: true, allow: ALL },
  'GET /api/agent/v1/me': { allow: READERS },
  'GET /api/agent/v1/summary': { allow: READERS },
  'GET /api/agent/v1/me/assignments': { allow: READERS },
  'GET /api/agent/v1/me/inbox': { allow: READERS },
  'POST /api/agent/v1/me/inbox/read': { allow: READERS, body: { all: true } },
  'GET /api/agent/v1/tasks': { allow: READERS },
  'GET /api/agent/v1/tasks/search': { allow: READERS, query: () => 'query=Shared' },
  'GET /api/agent/v1/projects': { allow: READERS },
  'GET /api/agent/v1/labels': { allow: READERS },
  'GET /api/agent/v1/people': { allow: READERS },
  'GET /api/agent/v1/goals': { allow: READERS },
  'POST /api/agent/v1/tasks': { allow: WRITERS, body: { title: 'From a key', project: 'Shared' } },
  'POST /api/agent/v1/time/start': { allow: WRITERS, body: {} },
  'POST /api/agent/v1/time/stop': { allow: WRITERS, body: {}, ok: [200, 404] },
  'GET /api/agent/v1/tasks/:key': { allow: READERS, key },
  'PATCH /api/agent/v1/tasks/:key': { allow: WRITERS, key, body: { priority: 'high' } },
  'POST /api/agent/v1/tasks/:key/claim': { allow: WRITERS, key: freshKey },
  'POST /api/agent/v1/tasks/:key/comments': { allow: WRITERS, key, body: { text: 'From a key' } },
  'PUT /api/agent/v1/tasks/:key/watch': { allow: READERS, key, body: {} },
  'DELETE /api/agent/v1/tasks/:key': { allow: WRITERS, key: freshKey, ok: { agentWrite: [202] } },
  'GET /api/agent/v1/approvals/:id': { allow: READERS, id: () => 'no-such-approval', ok: [404] },
};
