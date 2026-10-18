import table from '../table.js';
import shortAddress from '../shortAddress.js';
import createWorkspace from '../../provisioning/createWorkspace.js';
import provisionWorkspace from '../../provisioning/provisionWorkspace.js';

const day = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);

function find(ctx, name) {
  const request = ctx.store.requests.byName(String(name ?? '').trim().toLowerCase());
  if (!request) throw new Error(`No sign-up called ${name} is waiting.`);
  return request;
}

// Sign-ups waiting for approval (past CLOUD_SIGNUPS_PER_DAY, or above CLOUD_APPROVAL_ABOVE_PERCENT
// of the server's places). The person already has their setup code, so approving only creates
// and starts the workspace with it; rejecting releases the address.
const actions = {
  async requests(ctx, { print }) {
    const waiting = ctx.store.requests.list();
    if (!waiting.length) {
      print('No sign-ups are waiting.');
      return 0;
    }
    print(table(['NAME', 'OWNER', 'ASKED'], waiting.map((r) => [r.name, shortAddress(r.owner), day(r.requestedAt)])));
    print(`\n${waiting.length} waiting. ${ctx.store.workspaces.countLive()} of ${ctx.config.signup.maxWorkspaces} places are taken.`);
    return 0;
  },

  async approve(ctx, { args, print }) {
    const request = find(ctx, args[0]);
    ctx.store.requests.remove(request.id);
    let workspace;
    try {
      workspace = createWorkspace(ctx, { name: request.name, owner: request.owner, setupToken: request.setupToken });
    } catch (err) {
      ctx.store.requests.add(request);
      throw err;
    }
    print(`Creating ${workspace.name}.${ctx.config.domain}…`);
    await provisionWorkspace(ctx, workspace.id);
    print(`Ready: https://${workspace.name}.${ctx.config.domain}. Its owner already has the setup code.`);
    return 0;
  },

  async reject(ctx, { args, print }) {
    const request = find(ctx, args[0]);
    ctx.store.requests.remove(request.id);
    ctx.log.info('signup.rejected', { request: request.id, name: request.name });
    print(`${request.name} is no longer waiting; the address is free again.`);
    return 0;
  },
};

export default function requests(ctx, input) {
  return actions[input.command](ctx, input);
}
