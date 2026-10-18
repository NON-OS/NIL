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
  };
  if (rpc !== 'off' && app.verifierKey) env.NOX_VERIFIER_KEY = app.verifierKey;
  if (app.treasury) env.PLAN_TREASURY = app.treasury;
  if (app.treasury && app.invoiceKey && workspace.invoiceSlot !== null && workspace.invoiceSlot < app.invoiceSlots) {
    env.PLAN_INVOICE_SLOT = `${workspace.invoiceSlot}/${app.invoiceSlots}`;
    env.PLAN_INVOICE_KEY = app.invoiceKey;
  }
  if (config.links.source) env.SOURCE_URL = config.links.source;
  if (workspace.setupToken) env.SETUP_TOKEN = workspace.setupToken;

  return Object.freeze({
    id: workspace.id,
    name: workspace.name,
    image: workspace.image,
    volume: workspace.volume,
    env: Object.freeze(env),
    limits: Object.freeze({ cpus: plan.cpus, memoryBytes: plan.memoryBytes, pids: plan.pids }),
  });
}
