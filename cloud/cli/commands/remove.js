import confirm from '../confirm.js';
import findWorkspace from '../findWorkspace.js';
import deleteWorkspace from '../../provisioning/deleteWorkspace.js';

// delete <name> [--now] [--no-export]: a final encrypted export, then the grace period
// (CLOUD_DELETE_GRACE_DAYS) during which `resume` undoes it. --now deletes at once.
export default async function remove(ctx, { args, options, print }) {
  if (!args[0]) throw new Error('Usage: delete <name> [--now] [--no-export] [--yes]');
  const workspace = findWorkspace(ctx, args[0]);
  const how = options.now ? 'permanently, right now' : `after a ${ctx.config.lifecycle.deleteGraceDays}-day grace period`;
  const ok = await confirm(`Delete ${workspace.name}.${ctx.config.domain} ${how}${options['no-export'] ? ', without a final export' : ''}?`, workspace.name, { yes: options.yes });
  if (!ok) {
    print('Nothing was deleted.');
    return 1;
  }
  const after = await deleteWorkspace(ctx, workspace.id, { immediately: Boolean(options.now), exportFirst: !options['no-export'] });
  print(after.state === 'deleted' ? `${workspace.name} is deleted.` : `${workspace.name} is stopped and will be deleted after ${new Date(after.deleteAfter).toISOString().slice(0, 16).replace('T', ' ')} UTC. \`resume ${workspace.name}\` cancels.`);
  return 0;
}
