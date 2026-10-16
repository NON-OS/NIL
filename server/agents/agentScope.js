import sql from '../db/sql.js';

const cache = new Map();

// For an agent, which projects it works in ({ all: true } or a set of project ids); for a
// person, null. Visibility checks ask this for every viewer of every broadcast, so it's cached
// and dropped whenever an agent's scope changes.
const agentScope = {
  of(userId) {
    if (!userId) return null;
    if (cache.has(userId)) return cache.get(userId);
    const row = sql.get('SELECT u.kind, a.all_projects FROM users u LEFT JOIN agents a ON a.user_id = u.id WHERE u.id = ?', userId);
    const scope =
      row?.kind === 'agent'
        ? { all: Boolean(row.all_projects), projects: new Set(sql.all('SELECT project_id FROM agent_projects WHERE agent_id = ?', userId).map((r) => r.project_id)) }
        : null;
    cache.set(userId, scope);
    return scope;
  },

  isAgent: (userId) => Boolean(agentScope.of(userId)),

  covers(userId, projectId) {
    const scope = agentScope.of(userId);
    return Boolean(scope && (scope.all || (projectId && scope.projects.has(projectId))));
  },

  forget(userId) {
    if (userId) cache.delete(userId);
    else cache.clear();
  },
};

export default agentScope;
