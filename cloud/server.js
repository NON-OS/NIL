import configOrExit from './lib/configOrExit.js';
import createContext from './createContext.js';
import createSignupFlow from './signup/createSignupFlow.js';
import createPublicServer from './signup/http/createPublicServer.js';
import createInternalServer from './signup/http/createInternalServer.js';
import provisionWorkspace from './provisioning/provisionWorkspace.js';
import startScheduler from './ops/startScheduler.js';
import recoverInterrupted from './ops/recoverInterrupted.js';
import checkBackupTarget from './ops/checkBackupTarget.js';
import checkTlsMode from './ops/checkTlsMode.js';

const config = configOrExit();
const ctx = createContext(config, { role: 'server' });

// Caddy may not be up yet on a first start, so the file is written first and the reload is
// only attempted: Caddy reads the file itself when it starts.
ctx.routes.write();
ctx.routes.sync().catch(() => {});

// Sign-ups this server was provisioning when it stopped can't finish now: mark them failed and
// say so. The scheduler repeats the check hourly for anything else left stuck.
recoverInterrupted(ctx, { startup: true }).catch((err) => ctx.log.error('recover.failed', { error: err }));
checkBackupTarget(ctx).catch((err) => ctx.log.warn('backup.protection_unknown', { error: err }));
checkTlsMode(ctx).catch((err) => ctx.log.warn('tls.check_failed', { error: err }));

const flow = createSignupFlow(ctx, { provision: (id) => provisionWorkspace(ctx, id) });
const site = createPublicServer(ctx, flow);
const internal = createInternalServer(ctx);
site.listen(config.listen.port, config.listen.host, () => ctx.log.info('server.started', { port: config.listen.port, domain: config.domain, workspaces: ctx.store.workspaces.countLive() }));
internal.listen(config.listen.internalPort, config.listen.host);
const stopScheduler = startScheduler(ctx);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopScheduler();
    site.close();
    internal.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
