import findWorkspace from '../findWorkspace.js';
import resumeWorkspace from '../../provisioning/resumeWorkspace.js';
import stopWorkspace from '../../provisioning/stopWorkspace.js';
import suspendWorkspace from '../../provisioning/suspendWorkspace.js';
import resizeWorkspace from '../../provisioning/resizeWorkspace.js';

// start, resume, stop, suspend and resize: one workspace each, nothing to confirm, all
// reversible.
const actions = {
  start: (ctx, w) => resumeWorkspace(ctx, w.id),
  resume: (ctx, w) => resumeWorkspace(ctx, w.id),
  stop: (ctx, w) => stopWorkspace(ctx, w.id),
  suspend: (ctx, w, { options }) => suspendWorkspace(ctx, w.id, options.reason ?? 'operator'),
  resize: (ctx, w, { args }) => {
    if (!args[1]) throw new Error(`Usage: resize <name> <plan>. Plans: ${Object.keys(ctx.config.plans).join(', ')}`);
    return resizeWorkspace(ctx, w.id, args[1]);
  },
};

export default async function lifecycle(ctx, input) {
  const { command, args, print } = input;
  if (!args[0]) throw new Error(`Usage: ${command} <name>`);
  const workspace = findWorkspace(ctx, args[0]);
  const after = await actions[command](ctx, workspace, input);
  print(`${after.name}: ${after.state}${after.plan !== workspace.plan ? `, plan ${after.plan}` : ''}`);
  return 0;
}
