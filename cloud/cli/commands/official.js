import findWorkspace from '../findWorkspace.js';
import refreshWorkspace from '../../provisioning/refreshWorkspace.js';

// official <name> on|off: whether the workspace may start votes every NOX holder can sign. Its
// container is recreated so the app sees the change.
export default async function official(ctx, { args, print }) {
  const [name, value] = args;
  if (!name || !['on', 'off'].includes(value)) throw new Error('Usage: official <name> on|off');
  const workspace = findWorkspace(ctx, name);
  ctx.store.workspaces.setOfficial(workspace.id, value === 'on');
  ctx.store.events.add(workspace.id, 'official', value);
  const after = await refreshWorkspace(ctx, workspace.id);
  print(`${workspace.name}: official ${value} (${after.state})`);
  return 0;
}
