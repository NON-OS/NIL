import fs from 'node:fs';
import findWorkspace from '../findWorkspace.js';
import createHealthCheck from '../../ops/createHealthCheck.js';
import checkHost from '../../ops/checkHost.js';
import collectUsage from '../../ops/collectUsage.js';
import checkClaims from '../../ops/checkClaims.js';
import states from '../../provisioning/states.js';

// routes, check, setup-token and alert-test: small operator tools.
const tools = {
  // regenerate the Caddy configuration, reconnect Caddy to every workspace network, reload
  async routes(ctx, { options, print }) {
    const attached = await ctx.driver.ensureProxy(ctx.store.workspaces.list({ states: states.routed }).map((w) => w.id));
    const changed = await ctx.routes.sync();
    print(`${ctx.config.caddy.file}: ${changed ? 'updated and reloaded' : 'already current'}${attached ? `; Caddy reconnected to ${attached} networks` : ''}.`);
    if (options.print) print(`\n${fs.readFileSync(ctx.config.caddy.file, 'utf8')}`);
    return 0;
  },

  // run the background checks once, now
  async check(ctx, { print }) {
    await createHealthCheck(ctx)();
    const host = await checkHost(ctx);
    await collectUsage(ctx);
    await checkClaims(ctx);
    print(`Health, usage and claims checked. Disk free: ${host.freePercent.toFixed(1)}%. RAID: ${host.degraded.length ? `DEGRADED (${host.degraded.join(', ')})` : 'fine or not present'}.`);
    return 0;
  },

  async 'setup-token'(ctx, { args, print }) {
    const workspace = findWorkspace(ctx, args[0]);
    if (workspace.claimedAt || !workspace.setupToken) throw new Error(`${workspace.name} has already been set up; its token is gone.`);
    print(workspace.setupToken);
    return 0;
  },

  async 'alert-test'(ctx, { print }) {
    if (!ctx.config.alerts.webhook && !ctx.config.alerts.telegram) throw new Error('Neither CLOUD_ALERT_WEBHOOK nor a Telegram bot (CLOUD_ALERT_TELEGRAM_TOKEN and CLOUD_ALERT_TELEGRAM_CHAT) is set.');
    const sent = await ctx.alert('test', { message: 'A test alert from the Nil control plane. If you can read this, alerts work.', repeatMin: 0 });
    print(sent ? 'Test alert sent.' : 'No alert channel accepted the alert; see the log lines above.');
    return sent ? 0 : 1;
  },
};

export default function maintenance(ctx, input) {
  return tools[input.command](ctx, input);
}
