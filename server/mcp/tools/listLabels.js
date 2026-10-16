import sql from '../../db/sql.js';

export default {
  name: 'list_labels',
  title: 'List labels',
  description: 'Every label in the workspace. Use these names when you add or remove labels on a task.',
  write: false,
  http: { method: 'GET', path: '/labels' },
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  run: () => ({ labels: sql.all('SELECT name, color FROM labels ORDER BY name COLLATE NOCASE') }),
};
