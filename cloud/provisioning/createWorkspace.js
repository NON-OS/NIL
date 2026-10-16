import HttpError from '../lib/HttpError.js';
import newWorkspaceId from '../lib/newWorkspaceId.js';
import randomToken from '../lib/randomToken.js';
import nameCheck from '../names/nameCheck.js';
import nameStatus from '../names/nameStatus.js';

const ADDRESS = /^0x[0-9a-f]{40}$/;

// The operator may use reserved and blocklisted names (the foundation's own workspace, for
// example) and reuse a quarantined one, but never a name a live workspace holds.
function operatorName(ctx, name) {
  const syntax = nameCheck(name, { ...ctx.config.signup, reserved: new Set(), blocked: [] });
  if (!syntax.ok) return { available: false, name: syntax.name, reason: syntax.reason };
  if (ctx.store.workspaces.nameStatus(syntax.name, Infinity) === 'live') return { available: false, name: syntax.name, reason: 'That address is taken.' };
  return { available: true, name: syntax.name };
}

// Records a new workspace and reserves its name. The workload itself is built by
// provisionWorkspace, which sign-up runs in the background and the CLI waits for.
export default function createWorkspace(ctx, { name, owner, plan = ctx.config.defaultPlan, image = ctx.config.app.image, anyName = false }) {
  const { config, store } = ctx;
  const status = anyName ? operatorName(ctx, name) : nameStatus(ctx, name);
  if (!status.available) throw new HttpError(409, status.reason);
  const address = String(owner ?? '').toLowerCase();
  if (!ADDRESS.test(address)) throw HttpError.badRequest('The owner must be an Ethereum address.');
  if (!config.plans[plan]) throw HttpError.badRequest(`There is no plan called ${plan}.`);

  const id = newWorkspaceId();
  let workspace;
  try {
    workspace = store.workspaces.insert({ id, name: status.name, owner: address, state: 'provisioning', image, plan, volume: `nil-${id}-data`, setupToken: randomToken() });
  } catch (err) {
    // two sign-ups for the same name at the same moment: the unique index decides
    if (/UNIQUE/.test(err.message)) throw new HttpError(409, 'That address is taken.');
    throw err;
  }
  store.events.add(id, 'created', `plan=${plan} image=${image}`);
  ctx.log.info('workspace.created', { workspace: id, name: workspace.name, owner: ctx.walletTag(address), plan });
  return workspace;
}
