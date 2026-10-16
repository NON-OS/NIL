import configOrExit from './lib/configOrExit.js';
import createContext from './createContext.js';
import createSignupFlow from './signup/createSignupFlow.js';
import createPublicServer from './signup/http/createPublicServer.js';
import createInternalServer from './signup/http/createInternalServer.js';
import provisionWorkspace from './provisioning/provisionWorkspace.js';
import startScheduler from './ops/startScheduler.js';
import states from './provisioning/states.js';

const config = configOrExit();
const ctx = createContext(config);

// Caddy may not be up yet on a first start, so the file is written first and the reload is
// only attempted: Caddy reads the file itself when it starts.
ctx.routes.write();
ctx.routes.sync().catch(() => {});

// An operation can't survive a restart of the process running it. A first provisioning that
// was cut off is marked failed (resume retries it); anything else stuck is left for the
// operator, since the CLI may be in the middle of it.
const stale = ctx.store.now() - 3_600_000;
for (const workspace of ctx.store.workspaces.list({ states: states.busy }).filter((w) => w.updatedAt < stale)) {
  if (workspace.state === 'provisioning') ctx.store.workspaces.transition(workspace.id, ['provisioning'], 'failed');
  ctx.alert('workspace.stuck', { workspace, message: `It has been ${workspace.state} for over an hour.` });
}

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
