import sql from '../../db/sql.js';
import visiblePeople from '../../agents/visiblePeople.js';

export default {
  name: 'list_people',
  title: 'List people',
  description: 'The people and agents the caller can work with. "handle" is how to @mention them in a comment; "name" works wherever a tool asks for a person.',
  write: false,
  http: { method: 'GET', path: '/people' },
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run(args, { user }) {
    const known = visiblePeople(user);
    return {
      people: sql
        .all('SELECT id, name, title, role, kind FROM users WHERE deactivated = 0 ORDER BY name COLLATE NOCASE')
        .filter((u) => !known || known.has(u.id))
        .map((u) => ({ name: u.name, handle: `@${u.name.replace(/\s+/g, '')}`, kind: u.kind === 'agent' ? 'agent' : 'person', role: u.role, title: u.title, you: u.id === user.id })),
    };
  },
};
