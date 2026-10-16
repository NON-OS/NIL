import confirm from '../confirm.js';
import openBackup from '../openBackup.js';
import restoreWorkspace from '../../provisioning/restoreWorkspace.js';

// restore <name> <backup file or location> --identity <secret key file> [--owner 0x…]
// Replaces the workspace's data, or recreates the workspace on a new server.
export default async function restore(ctx, { args, options, print }) {
  const [name, source] = args;
  if (!name || !source) throw new Error('Usage: restore <name> <backup file or location> --identity <secret key file> [--owner <0x address>] [--yes]');
  const { manifest, rest } = await openBackup(ctx, source, options.identity);
  const existing = ctx.store.workspaces.byName(name.toLowerCase());
  const notes = [];
  if (manifest) notes.push(`This backup is of ${manifest.name}, taken ${manifest.takenAt}.`);
  if (manifest && manifest.name !== name.toLowerCase()) notes.push(`It will be restored into ${name}, a different workspace.`);
  notes.push(existing ? `All current data in ${name} will be replaced.` : `${name} doesn’t exist here and will be created.`);
  if (!(await confirm(notes.join('\n'), name.toLowerCase(), { yes: options.yes }))) {
    print('Nothing was changed.');
    rest.destroy();
    return 1;
  }
  if (!existing && !manifest?.owner && !options.owner) throw new Error('This backup doesn’t name an owner; pass --owner <0x address>.');
  const restored = await restoreWorkspace(ctx, { name: name.toLowerCase(), tar: rest, manifest, owner: options.owner ?? null });
  print(`${restored.name} is restored and running at https://${restored.name}.${ctx.config.domain}`);
  return 0;
}
