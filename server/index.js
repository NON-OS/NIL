import http from 'node:http';
import config from './config.js';
import migrate from './db/migrate.js';
import createApp from './app.js';
import attachRealtime from './realtime/attachRealtime.js';
import purge from './jobs/purge.js';
import checkPayments from './jobs/checkPayments.js';
import closeProposals from './jobs/closeProposals.js';
import sendReminders from './jobs/sendReminders.js';

migrate();
purge();
setInterval(purge, 60 * 60_000).unref();
setInterval(checkPayments, 60_000).unref();
setInterval(closeProposals, 60_000).unref();
setInterval(sendReminders, 60_000).unref();

const server = http.createServer(createApp());
attachRealtime(server);

server.listen(config.port, config.host, () => {
  console.log(`NONOS is running on http://localhost:${config.port} (AI assist ${config.ai.enabled ? 'on' : 'off'})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
