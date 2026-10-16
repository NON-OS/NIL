import createWorkspace from '../../provisioning/createWorkspace.js';
import provisionWorkspace from '../../provisioning/provisionWorkspace.js';

// For workspaces the operator sets up by hand, the foundation's own included. --any-name allows
// reserved names. The setup code is printed once: hand it only to the owner, privately.
export default async function create(ctx, { args, options, print }) {
  if (!args[0] || !options.owner) throw new Error('Usage: create <name> --owner <0x address> [--plan <plan>] [--image <image>] [--any-name]');
  const workspace = createWorkspace(ctx, { name: args[0], owner: options.owner, plan: options.plan, image: options.image, anyName: Boolean(options['any-name']) });
  print(`Creating ${workspace.name}.${ctx.config.domain} on ${workspace.image}…`);
  const ready = await provisionWorkspace(ctx, workspace.id);
  print(`Ready: https://${ready.name}.${ctx.config.domain}`);
  print(`Setup code for the owner (shown once here; \`setup-token ${ready.name}\` shows it again until it is used):`);
  print(ready.setupToken);
  return 0;
}
