// image name without its tag or digest; a registry port (host:5000/...) stays
const repository = (image) => image.replace(/@sha256:[0-9a-f]{64}$/, '').replace(/:[\w][\w.-]{0,127}$/, '');

// The image a workspace restored onto this server runs. A backup's manifest names the image the
// workspace had, but anyone with the backup public keys can write a backup, so that name is
// used only when it is the same repository as CLOUD_APP_IMAGE and already on this server.
// Anything else runs CLOUD_APP_IMAGE, which migrates an older database forward when it starts.
// Nothing is ever pulled because a backup asked for it.
export default async function restoreImage(ctx, wanted) {
  const current = ctx.config.app.image;
  if (typeof wanted !== 'string' || !wanted || wanted === current) return current;
  if (repository(wanted) === repository(current) && (await ctx.driver.hasImage(wanted))) return wanted;
  ctx.log.info('restore.image_replaced', { wanted, using: current });
  return current;
}
