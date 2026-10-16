import sql from '../db/sql.js';
import HttpError from '../lib/HttpError.js';
import visiblePeople from '../agents/visiblePeople.js';

const plain = (value) => String(value).trim().replace(/^@/, '');

// Assistants speak in names ("Jane", "@JaneDoe", "Growth"), the database in ids. "me" means the
// caller. Someone the caller isn't allowed to know about reads as nobody at all.
const resolveRefs = {
  person(value, me) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const name = plain(value);
    if (name.toLowerCase() === 'me') return me.id;
    const row = sql.get("SELECT id FROM users WHERE deactivated = 0 AND (lower(name) = lower(?) OR lower(replace(name, ' ', '')) = lower(?))", name, name);
    const known = visiblePeople(me);
    if (!row || (known && !known.has(row.id))) throw HttpError.badRequest(`Nobody called “${value}” is in this workspace.`);
    return row.id;
  },

  project(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const row = sql.get('SELECT id FROM projects WHERE lower(name) = lower(?) OR lower(key) = lower(?)', String(value), String(value));
    if (!row) throw HttpError.badRequest(`There’s no project called “${value}”.`);
    return row.id;
  },

  labels(names = []) {
    return names.map((value) => {
      const row = sql.get('SELECT id FROM labels WHERE lower(name) = lower(?)', plain(value));
      if (!row) throw HttpError.badRequest(`There’s no label called “${value}”. Call list_labels to see the ones that exist.`);
      return row.id;
    });
  },

  goal(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const row = sql.get('SELECT id FROM goals WHERE lower(title) = lower(?)', String(value).trim());
    if (!row) throw HttpError.badRequest(`There’s no goal called “${value}”.`);
    return row.id;
  },
};

export default resolveRefs;
