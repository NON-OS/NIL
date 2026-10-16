import express from 'express';
import sql from '../db/sql.js';
import config from '../config.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import requireMember from '../auth/requireMember.js';
import tools from '../mcp/tools.js';
import loadAgent from '../agents/loadAgent.js';
import agentOr404 from '../agents/manage/agentOr404.js';
import agentSettings from '../agents/agentSettings.js';
import audit from '../agents/audit.js';
import webhookEvents from '../agents/webhooks/webhookEvents.js';
import parseAgentInput from '../agents/manage/parseAgentInput.js';
import saveAgent from '../agents/manage/saveAgent.js';
import toAgent from '../agents/manage/toAgent.js';
import issueAgentKey from '../agents/manage/issueAgentKey.js';
import setAgentPaused from '../agents/manage/setAgentPaused.js';
import removeAgent from '../agents/manage/removeAgent.js';
import setAgentsEnabled from '../agents/manage/setAgentsEnabled.js';

const router = express.Router();

// What the Add agent form offers, and the defaults an empty limit falls back to.
const formOptions = () => ({
  tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, write: Boolean(t.write) })),
  events: webhookEvents,
  anthropicAvailable: config.ai.hasKey,
  allowLocalEndpoints: config.agents.allowLocalEndpoints,
  webhookToleranceSeconds: config.agents.webhookToleranceSeconds,
  defaults: {
    model: config.agents.model,
    doneStatus: config.agents.doneStatus,
    maxSteps: config.agents.maxSteps,
    maxRunTokens: config.agents.maxRunTokens,
    maxDayTokens: config.agents.maxDayTokens,
    rateLimit: config.agents.rateLimit,
    priceIn: config.agents.priceIn,
    priceOut: config.agents.priceOut,
  },
});

router.get(
  '/agents',
  requireMember,
  route((req) => ({
    agents: sql.all('SELECT user_id FROM agents WHERE removed_at IS NULL ORDER BY created_at').map((r) => toAgent(loadAgent(r.user_id), req.user)),
    settings: agentSettings.get(),
    ...(req.user.isAdmin ? { options: formOptions() } : {}),
  })),
);

router.post(
  '/agents',
  requireAdmin,
  route(async (req) => {
    const { agent, key } = saveAgent(await parseAgentInput(req.body), req.user);
    return { agent: toAgent(agent, req.user), key };
  }),
);

router.patch(
  '/agents/:id',
  requireAdmin,
  route(async (req) => {
    const existing = agentOr404(req.params.id);
    const { agent } = saveAgent(await parseAgentInput(req.body, existing), req.user, existing.id);
    return { agent: toAgent(agent, req.user) };
  }),
);

router.post(
  '/agents/:id/pause',
  requireAdmin,
  route((req) => {
    setAgentPaused(agentOr404(req.params.id).id, true, req.user);
    return { agent: toAgent(loadAgent(req.params.id), req.user) };
  }),
);

router.post(
  '/agents/:id/resume',
  requireAdmin,
  route((req) => {
    setAgentPaused(agentOr404(req.params.id).id, false, req.user);
    return { agent: toAgent(loadAgent(req.params.id), req.user) };
  }),
);

// Issues a new key and revokes the old one. Shown once.
router.post(
  '/agents/:id/key',
  requireAdmin,
  route((req) => {
    const agent = agentOr404(req.params.id);
    const key = issueAgentKey(agent.id, agent.access);
    audit({ agentId: agent.id, actorId: req.user.id, via: 'admin', action: 'key_rotated', outcome: 'ok' });
    return { key, agent: toAgent(loadAgent(agent.id), req.user) };
  }),
);

router.delete(
  '/agents/:id',
  requireAdmin,
  route((req) => {
    removeAgent(agentOr404(req.params.id).id, req.user);
    return { ok: true };
  }),
);

router.put(
  '/agent-settings',
  requireAdmin,
  route((req) => {
    if (typeof req.body?.enabled !== 'boolean') throw HttpError.badRequest('Say whether agents are on: enabled true or false.');
    return { settings: setAgentsEnabled(req.body.enabled, req.user) };
  }),
);

export default router;
