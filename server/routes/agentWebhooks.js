import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import loadAgent from '../agents/loadAgent.js';
import agentOr404 from '../agents/manage/agentOr404.js';
import webhookAdmin from '../agents/manage/webhookAdmin.js';
import toAgent from '../agents/manage/toAgent.js';
import enqueueDelivery from '../agents/webhooks/enqueueDelivery.js';
import sendDelivery from '../agents/webhooks/sendDelivery.js';
import toDelivery from '../agents/webhooks/toDelivery.js';

const router = express.Router();
router.use(['/agents/:id/webhook', '/webhook-deliveries'], requireAdmin);

const delivery = (id) => toDelivery(sql.get('SELECT * FROM webhook_deliveries WHERE id = ?', id));

// Saving returns the signing secret only when the webhook is new.
router.put(
  '/agents/:id/webhook',
  route(async (req) => {
    const agent = agentOr404(req.params.id);
    const { secret } = await webhookAdmin.save(agent.id, req.body, req.user);
    return { secret, agent: toAgent(loadAgent(agent.id), req.user) };
  }),
);

router.post('/agents/:id/webhook/secret', route((req) => webhookAdmin.rotate(agentOr404(req.params.id).id, req.user)));

router.post(
  '/agents/:id/webhook/enable',
  route((req) => {
    const agent = agentOr404(req.params.id);
    webhookAdmin.enable(agent.id, req.user);
    return { agent: toAgent(loadAgent(agent.id), req.user) };
  }),
);

router.delete(
  '/agents/:id/webhook',
  route((req) => {
    const agent = agentOr404(req.params.id);
    webhookAdmin.remove(agent.id, req.user);
    return { agent: toAgent(loadAgent(agent.id), req.user) };
  }),
);

// A signed "ping" sent right away, so an admin can check the receiver before real events flow.
router.post(
  '/agents/:id/webhook/test',
  route(async (req) => {
    const agent = agentOr404(req.params.id);
    const id = enqueueDelivery(agent.id, 'ping', { message: 'A test delivery from Nil.' }, { force: true, hold: true });
    if (!id) throw HttpError.badRequest('Add a webhook first, and make sure the agent isn’t paused or switched off.');
    await sendDelivery(id, { manual: true });
    return { delivery: delivery(id) };
  }),
);

router.get(
  '/agents/:id/webhook/deliveries',
  route((req) => ({
    deliveries: sql.all('SELECT * FROM webhook_deliveries WHERE agent_id = ? ORDER BY created_at DESC LIMIT 50', agentOr404(req.params.id).id).map(toDelivery),
  })),
);

router.post(
  '/webhook-deliveries/:id/redeliver',
  route(async (req) => {
    const row = sql.get('SELECT agent_id, status FROM webhook_deliveries WHERE id = ?', req.params.id);
    if (!row) throw HttpError.notFound('That delivery');
    if (row.status === 'sending') throw new HttpError(409, 'That delivery is being sent right now.');
    if (!sql.get('SELECT 1 FROM agent_webhooks WHERE agent_id = ?', row.agent_id)) throw HttpError.badRequest('This agent has no webhook any more.');
    await sendDelivery(req.params.id, { manual: true });
    return { delivery: delivery(req.params.id) };
  }),
);

export default router;
