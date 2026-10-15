import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';

// Assistants speak in names ("Jane", "Growth"), the database in ids. "me" means the caller.
const resolveRefs = {
  person(value, me) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    if (String(value).toLowerCase() === 'me') return me.id;
    const row = sql.get('SELECT id FROM users WHERE deactivated = 0 AND lower(name) = lower(?)', String(value));
    if (!row) throw HttpError.badRequest(`Nobody called “${value}” is in this workspace.`);
    return row.id;
  },

  project(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const row = sql.get('SELECT id FROM projects WHERE lower(name) = lower(?) OR lower(key) = lower(?)', String(value), String(value));
    if (!row) throw HttpError.badRequest(`There’s no project called “${value}”.`);
    return row.id;
  },
};

export default resolveRefs;
