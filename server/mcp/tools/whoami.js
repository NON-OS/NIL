import sql from '../../db/sql.js';
import publicWorkspace from '../../services/publicWorkspace.js';

const PRIVATE = 'Private tasks and docs are end-to-end encrypted in people’s browsers. Agents can never see or read them, and the server can’t either.';

export default {
  name: 'whoami',
  title: 'Who am I',
  description: 'The Nil account behind this key, its role, access and the workspace. Call this first to learn the task key prefix and, for an agent, which projects and tools it has.',
  write: false,
  http: { method: 'GET', path: '/me' },
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run(args, { user, scope, agent }) {
    const ws = publicWorkspace();
    const base = { name: user.name, kind: agent ? 'agent' : 'person', role: user.role, workspace: ws.name, taskPrefix: ws.taskPrefix, access: scope };
    if (!agent) return base;
    const projects = agent.allProjects
      ? 'all'
      : sql.all('SELECT name FROM projects WHERE id IN (SELECT project_id FROM agent_projects WHERE agent_id = ?) ORDER BY position', agent.id).map((p) => p.name);
    return { ...base, projects, tools: agent.tools, privateWork: PRIVATE };
  },
};
