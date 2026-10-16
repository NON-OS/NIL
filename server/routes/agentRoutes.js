import express from 'express';
import agents from './agents.js';
import agentWebhooks from './agentWebhooks.js';
import agentRuns from './agentRuns.js';

// Everything the app itself calls for agents: Settings → Agents, approval cards and run logs.
// Agents themselves use /mcp and /api/agent/v1 with their own keys, never these.
const agentRoutes = express.Router();
agentRoutes.use(agents, agentWebhooks, agentRuns);

export default agentRoutes;
