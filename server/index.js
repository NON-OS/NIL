import http from 'node:http';
import config from './config.js';
import migrate from './db/migrate.js';
import createApp from './app.js';
import attachRealtime from './realtime/attachRealtime.js';
import purge from './jobs/purge.js';
import checkPayments from './jobs/checkPayments.js';
import closeProposals from './jobs/closeProposals.js';
import sendReminders from './jobs/sendReminders.js';
import recoverAgentRuns from './jobs/recoverAgentRuns.js';
import runAgentQueue from './jobs/runAgentQueue.js';
import deliverWebhooks from './jobs/deliverWebhooks.js';
import agentDueSoon from './jobs/agentDueSoon.js';
import pruneAgentData from './jobs/pruneAgentData.js';

migrate();
purge();
setInterval(purge, 60 * 60_000).unref();
setInterval(checkPayments, 60_000).unref();
setInterval(closeProposals, 60_000).unref();
setInterval(sendReminders, 60_000).unref();

// Agents: the built-in runner's queue, webhook deliveries, due-soon notices and log pruning.
recoverAgentRuns();
runAgentQueue();
deliverWebhooks();
setInterval(runAgentQueue, config.agents.pollMs).unref();
setInterval(deliverWebhooks, config.agents.pollMs).unref();
setInterval(agentDueSoon, 5 * 60_000).unref();
setInterval(pruneAgentData, 60 * 60_000).unref();

const server = http.createServer(createApp());
attachRealtime(server);

server.listen(config.port, config.host, () => {
  console.log(`Nil is running on http://localhost:${config.port} (AI assist ${config.ai.enabled ? 'on' : 'off'})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
