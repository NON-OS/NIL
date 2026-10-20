// At start, the warning loadConfig.js gives for on-demand certificates with open sign-ups, as an
// alert as well, so it reaches the operator somewhere other than the log. True when it went out.
export default async function checkTlsMode(ctx) {
  if (ctx.config.caddy.tls !== 'on-demand' || !ctx.config.signup.open) return false;
  await ctx.alert('tls.on_demand_signups', {
    severity: 'warning',
    message: 'Sign-ups are open with CLOUD_TLS=on-demand. Let’s Encrypt issues at most 50 certificates a week for the domain, so throwaway sign-ups can leave real workspaces without one. Switch to CLOUD_TLS=wildcard, or set CLOUD_SIGNUP=closed.',
  });
  return true;
}
