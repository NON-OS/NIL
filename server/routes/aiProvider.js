import express from 'express';
import config from '../config.js';
import route from '../lib/route.js';
import requireAdmin from '../auth/requireAdmin.js';
import rateLimit from '../auth/rateLimit.js';
import hub from '../realtime/hub.js';
import aiProvider from '../ai/provider/aiProvider.js';
import aiAvailable from '../ai/provider/aiAvailable.js';
import providerSummary from '../ai/provider/providerSummary.js';
import parseProviderInput from '../ai/provider/parseProviderInput.js';
import testProvider from '../ai/provider/testProvider.js';
import creditSetting from '../aiCredits/creditSetting.js';

const router = express.Router();

// every open app learns at once whether AI is on and who it goes to
const publish = () => hub.broadcast({ type: 'ai-provider', ai: aiAvailable(), provider: providerSummary(), anonymous: aiAvailable() && creditSetting.on() });

const settings = () => ({ provider: aiProvider.view(), outbound: config.agents.outbound, serverDefault: config.ai.enabled, allowLocalEndpoints: config.agents.allowLocalEndpoints });

// The workspace's AI provider, admins only. The key is never sent back, only whether one is set
// and its last four characters.
router.get('/ai-provider', requireAdmin, route(() => settings()));

router.put(
  '/ai-provider',
  requireAdmin,
  route(async (req) => {
    aiProvider.save(await parseProviderInput(req.body), req.user.id);
    publish();
    return settings();
  }),
);

router.delete(
  '/ai-provider',
  requireAdmin,
  route(() => {
    aiProvider.clear();
    publish();
    return settings();
  }),
);

// a tiny request with what the form holds, saved or not
router.post(
  '/ai-provider/test',
  requireAdmin,
  rateLimit({ windowMs: 60_000, max: 10, key: (req) => `ai-provider-test:${req.user.id}`, message: 'That’s a lot of tests. Give it a minute.' }),
  route(async (req) => {
    const input = await parseProviderInput({ ...req.body, apiKey: req.body?.apiKey || undefined });
    return testProvider({ ...input, apiKey: input.apiKey ?? undefined });
  }),
);

export default router;
