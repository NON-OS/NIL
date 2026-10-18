import http from 'node:http';
import config from './config.js';
import db from './db/connection.js';
import migrate from './db/migrate.js';
import createApp from './app.js';
import attachRealtime from './realtime/attachRealtime.js';
import startJobs from './jobs/startJobs.js';
import setupToken from './auth/setupToken.js';
import gracefulShutdown from './lib/gracefulShutdown.js';
import appVersion from './lib/appVersion.js';
import log from './lib/log.js';
import settleStaged from './services/settleStaged.js';
import clearScratch from './capsules/clearScratch.js';
import vapidKeys from './push/vapidKeys.js';
import recoverAgentRuns from './jobs/recoverAgentRuns.js';

try {
  const { from, to, snapshot } = migrate(db, { snapshotDir: config.dataDir });
  if (from > 0 && from < to) log.info('db', `Upgraded the database from schema ${from} to ${to}. The copy taken before is ${snapshot}.`);
} catch (err) {
  if (err.code === 'SCHEMA_TOO_NEW') log.error('db', err.message);
  else log.error('db', 'The database couldn’t be brought up to date. The step that failed was rolled back.', err);
  process.exit(1);
}
// nothing is mid-upload, mid-export or mid-restore before the server listens, so every staged
// copy can be settled now and every scratch copy of the database cleared
settleStaged();
clearScratch();
// made before any request can ask for it, so two first requests can't race to create it
if (config.push.enabled) vapidKeys.ensure();

setupToken.prepare();
// agent runs a restart cut off go back in the queue before the jobs start
recoverAgentRuns();
const jobs = startJobs();
const server = http.createServer(createApp());
const realtime = attachRealtime(server);
const shutdown = gracefulShutdown({ server, realtime, jobs, timeoutMs: config.shutdownTimeoutMs });

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(signal));

// After either of these, nothing about the process can be trusted to be in order any more, so
// it stops, as cleanly as it still can, and the supervisor starts a fresh one.
process.on('unhandledRejection', (err) => {
  log.error('server', 'A promise was rejected and nothing handled it.', err);
  shutdown('unhandled rejection', 1);
});
process.on('uncaughtException', (err) => {
  log.error('server', 'An error was thrown and nothing caught it.', err);
  shutdown('uncaught exception', 1);
});

server.listen(config.port, config.host, () => {
  log.info('server', `Nil ${appVersion} is listening on ${config.host}:${server.address().port}. APP_URL is ${config.appUrl ?? 'not set'}. AI assist is ${config.ai.enabled ? 'on' : 'off'}.`);
});
