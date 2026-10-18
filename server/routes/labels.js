import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import newId from '../lib/newId.js';
import domain from '../lib/domain.js';
import HttpError from '../lib/HttpError.js';
import hub from '../realtime/hub.js';
import publishTask from '../services/publishTask.js';
import toLabel from '../mappers/toLabel.js';

const router = express.Router();

function publish(id) {
  const label = toLabel(sql.get('SELECT * FROM labels WHERE id = ?', id));
  hub.broadcast({ type: 'label', label });
  return { label };
}

function uniqueName(name, exceptId = '') {
  if (sql.get('SELECT 1 FROM labels WHERE name = ? COLLATE NOCASE AND id != ?', name, exceptId)) {
    throw HttpError.badRequest('A label with that name already exists.');
  }
  return name;
}

router.post(
  '/labels',
  route((req) => {
    const name = uniqueName(check.text(req.body.name, 'Label name', { min: 1, max: 40 }));
    const id = newId();
    const color = check.isColor(req.body.color) ? req.body.color.toLowerCase() : domain.colors[Math.floor(Math.random() * domain.colors.length)];
    sql.run('INSERT INTO labels (id, name, color, created_at) VALUES (?, ?, ?, ?)', id, name, color, Date.now());
    return publish(id);
  }),
);

router.patch(
  '/labels/:id',
  route((req) => {
    const { id } = req.params;
    if (!sql.get('SELECT 1 FROM labels WHERE id = ?', id)) throw HttpError.notFound('That label');
    sql.tx(() => {
      if ('name' in req.body) sql.run('UPDATE labels SET name = ? WHERE id = ?', uniqueName(check.text(req.body.name, 'Label name', { min: 1, max: 40 }), id), id);
      if ('color' in req.body) sql.run('UPDATE labels SET color = ? WHERE id = ?', check.color(req.body.color), id);
    });
    return publish(id);
  }),
);

router.delete(
  '/labels/:id',
  route((req) => {
    const { id } = req.params;
    const tagged = sql.all('SELECT DISTINCT t.id, t.labels FROM tasks t, json_each(t.labels) j WHERE j.value = ?', id);
    sql.tx(() => {
      for (const t of tagged) {
        const rest = JSON.parse(t.labels).filter((labelId) => labelId !== id);
        sql.run('UPDATE tasks SET labels = ? WHERE id = ?', JSON.stringify(rest), t.id);
      }
      sql.run('DELETE FROM labels WHERE id = ?', id);
    });
    hub.broadcast({ type: 'label.delete', id });
    for (const t of tagged) publishTask(t.id);
    return { ok: true };
  }),
);

export default router;
