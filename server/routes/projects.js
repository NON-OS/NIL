import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import domain from '../lib/domain.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import hub from '../realtime/hub.js';
import publishTask from '../services/publishTask.js';
import toProject from '../mappers/toProject.js';
import guestScope from '../services/guestScope.js';

const router = express.Router();

// "Marketing Site" -> "MS", "Growth" -> "GRO"
function keyFrom(name) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return 'PRJ';
  return words.length === 1 ? words[0].slice(0, 3) : words.map((w) => w[0]).join('').slice(0, 4);
}

const cleanKey = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

function publish(id) {
  const project = toProject(sql.get('SELECT * FROM projects WHERE id = ?', id));
  const event = { type: 'project', project };
  hub.broadcast((viewer) => (guestScope.of(viewer.id)?.has(project.id) === false ? null : event));
  return { project };
}

router.post(
  '/projects',
  route((req) => {
    const b = req.body;
    const name = check.text(b.name, 'Project name', { min: 1, max: 80 });
    const id = newId();
    const position = (sql.get('SELECT MAX(position) AS m FROM projects').m ?? 0) + 1024;
    sql.run(
      'INSERT INTO projects (id, name, key, color, description, lead_id, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      name,
      cleanKey(b.key) || keyFrom(name),
      check.isColor(b.color) ? b.color.toLowerCase() : domain.colors[0],
      check.text(b.description, 'Description', { max: 2000 }),
      check.ref('users', b.leadId, 'Lead'),
      position,
      req.user.id,
      Date.now(),
    );
    return publish(id);
  }),
);

router.patch(
  '/projects/:id',
  route((req) => {
    const { id } = req.params;
    if (!sql.get('SELECT 1 FROM projects WHERE id = ?', id)) throw HttpError.notFound('That project');
    const b = req.body;
    const set = (column, value) => sql.run(`UPDATE projects SET ${column} = ? WHERE id = ?`, value, id);
    sql.tx(() => {
      if ('name' in b) set('name', check.text(b.name, 'Project name', { min: 1, max: 80 }));
      if ('key' in b) {
        const key = cleanKey(b.key);
        if (!key) throw HttpError.badRequest('The key needs at least one letter or digit.');
        set('key', key);
      }
      if ('color' in b) set('color', check.color(b.color));
      if ('description' in b) set('description', check.text(b.description, 'Description', { max: 2000 }));
      if ('leadId' in b) set('lead_id', check.ref('users', b.leadId, 'Lead'));
      if ('archived' in b) set('archived', b.archived ? 1 : 0);
      if ('position' in b) set('position', check.number(b.position, 'Position') ?? 0);
    });
    return publish(id);
  }),
);

router.delete(
  '/projects/:id',
  requireAdmin,
  route((req) => {
    const affected = sql.all('SELECT id FROM tasks WHERE project_id = ?', req.params.id);
    sql.run('DELETE FROM projects WHERE id = ?', req.params.id);
    hub.broadcast({ type: 'project.delete', id: req.params.id });
    guestScope.forget();
    for (const { id } of affected) publishTask(id);
    return { ok: true };
  }),
);

export default router;
