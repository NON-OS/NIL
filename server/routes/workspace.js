import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import check from '../lib/check.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import hub from '../realtime/hub.js';
import publicWorkspace from '../services/publicWorkspace.js';
import cryptoTools from '../services/cryptoTools.js';

const router = express.Router();

router.patch(
  '/workspace',
  requireAdmin,
  route((req) => {
    // a field that doesn't pass leaves the others as they were
    sql.tx(() => {
      if ('name' in req.body) {
        sql.run('UPDATE workspace SET name = ? WHERE id = 1', check.text(req.body.name, 'Workspace name', { min: 1, max: 60 }));
      }
      if ('taskPrefix' in req.body) {
        const prefix = String(req.body.taskPrefix).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
        if (!prefix) throw HttpError.badRequest('The task prefix needs at least one letter or digit.');
        sql.run('UPDATE workspace SET task_prefix = ? WHERE id = 1', prefix);
      }
      if ('cryptoTools' in req.body) {
        if (typeof req.body.cryptoTools !== 'boolean') throw HttpError.badRequest('Crypto tools are either on or off.');
        cryptoTools.set(req.body.cryptoTools);
      }
    });
    const workspace = publicWorkspace();
    hub.broadcast({ type: 'workspace', workspace });
    return { workspace };
  }),
);

export default router;
