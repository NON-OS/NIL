// Everything a runtime needs to run one workspace, independent of Docker or any other runtime.
// The environment is the app's normal configuration (see the root .env.example): the control
// plane only sets what makes a workspace hosted, and the operator's shared env file fills in
// the rest. Managed values come last so the shared file can't override them.
export default function workspaceSpec(config, workspace) {
  const plan = config.plans[workspace.plan] ?? config.plans[config.defaultPlan];
  const { app, caddy } = config;
  let rpc = app.rpcUrl;
  // with rpc-only egress the workspace has no route out, and reaches the chain through Caddy
  if (rpc !== 'off' && app.egress === 'rpc-only') rpc = `http://${caddy.container}:${caddy.rpcRelayPort}`;

  const env = {
    ...app.extraEnv,
    APP_URL: `https://${workspace.name}.${config.domain}`,
    TRUST_PROXY: '1',
    NOX_RPC_URL: rpc,
    // the plan's disk, as the quota the app enforces on uploads (Docker can't cap a volume); at
    // least 1, since 0 turns the app's quota off
    UPLOAD_QUOTA_MB: String(Math.max(1, Math.floor(plan.diskBytes / 1024 ** 2))),
    // and the largest capsule a fresh workspace takes in, so a restore can't bring more than the
    // plan holds; the app also checks there's room on disk for the upload and its unpacked copy
    MAX_CAPSULE_MB: String(Math.max(1, Math.floor(plan.diskBytes / 1024 ** 2))),
  };
  if (rpc !== 'off' && app.verifierMode !== 'off') {
    env.NOX_VERIFIER_MODE = app.verifierMode;
    env.NOX_VERIFIER_KEY = app.verifierKey;
    // in shadow mode the verifier is a second address next to the node, through its own relay
    if (app.verifierMode === 'shadow') env.NOX_VERIFIER_URL = app.egress === 'rpc-only' ? `http://${caddy.container}:${caddy.verifierRelayPort}` : app.verifierUrl;
  }
  if (app.treasury) env.PLAN_TREASURY = app.treasury;
  if (app.treasury && app.invoiceKey && workspace.invoiceSlot !== null && workspace.invoiceSlot < app.invoiceSlots) {
    env.PLAN_INVOICE_SLOT = `${workspace.invoiceSlot}/${app.invoiceSlots}`;
    env.PLAN_INVOICE_KEY = app.invoiceKey;
  }
  // the owner's wallet already had its free trial in another workspace
  if (workspace.trial === false) env.PLAN_TRIAL_DAYS = '0';
  // with no route out, a webhook or a model endpoint elsewhere could never be reached, so the app
  // doesn't offer them
  if (app.egress === 'rpc-only') env.AGENT_OUTBOUND = 'off';
  if (config.links.source) env.SOURCE_URL = config.links.source;
  if (workspace.setupToken) env.SETUP_TOKEN = workspace.setupToken;

  // its own uid and gid: files in one workspace's volume belong to nobody else on the host, and a
  // process that broke out of its container would be no user the host knows. 0 is the old way,
  // the image's own user, for going back to a release from before this.
  const uid = app.uidBase ? app.uidBase + (workspace.invoiceSlot ?? 0) : 1000;

  return Object.freeze({
    id: workspace.id,
    name: workspace.name,
    user: `${uid}:${uid}`,
    image: workspace.image,
    volume: workspace.volume,
    env: Object.freeze(env),
    limits: Object.freeze({ cpus: plan.cpus, memoryBytes: plan.memoryBytes, pids: plan.pids }),
  });
}
