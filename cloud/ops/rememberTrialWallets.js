// Owners of workspaces made before trials were counted per wallet have had theirs. Run at start;
// adding a tag twice changes nothing.
export default function rememberTrialWallets(ctx) {
  let added = 0;
  for (const owner of ctx.store.workspaces.owners()) added += ctx.store.trials.add(ctx.walletTag(owner));
  if (added) ctx.log.info('trials.remembered', { wallets: added });
  return added;
}
