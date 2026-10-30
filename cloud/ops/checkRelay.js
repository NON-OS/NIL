// Hourly, with calls on: the relay is running, and on the certificate Caddy has now. coturn reads
// its certificate once, as it starts, and Caddy renews the wildcard by itself every two months or
// so, so once Caddy's copy is newer than the running relay, the relay restarts with it. Calls in
// progress lose the relay for a moment and reconnect.
export default async function checkRelay(ctx) {
  const { calls, caddy } = ctx.config;
  if (!calls) return null;
  const relay = await ctx.driver.service(calls.container);
  if (!relay?.running) {
    await ctx.alert('turn.down', { severity: 'critical', repeatMin: 60, message: `The relay (${calls.container}) isn’t running, so no workspace can start a call. Start it with: docker compose --profile calls up -d turn` });
    return { running: false };
  }
  if (!calls.certificate || !caddy.container) return { running: true };
  const issued = await ctx.driver.serviceFileTime(caddy.container, calls.certificate);
  if (!issued || !relay.startedAt || issued <= relay.startedAt) return { running: true };
  await ctx.driver.restartService(calls.container);
  ctx.log.info('turn.restarted', { reason: 'certificate renewed', issued: new Date(issued).toISOString() });
  return { running: true, restarted: true };
}
