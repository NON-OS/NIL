import states from '../provisioning/states.js';

// Caddy's on-demand TLS asks before it requests a certificate. Only the sign-up host and
// workspaces that exist get one: otherwise anyone could make the server request certificates
// for random names until the CA's rate limits locked real workspaces out.
export default function tlsAllowed(ctx, domain) {
  const host = String(domain ?? '').toLowerCase();
  if (host === ctx.config.signupHost) return true;
  const suffix = `.${ctx.config.domain}`;
  if (!host.endsWith(suffix)) return false;
  const name = host.slice(0, -suffix.length);
  if (!/^[a-z0-9-]+$/.test(name)) return false;
  const workspace = ctx.store.workspaces.byName(name);
  return Boolean(workspace && (states.routed.includes(workspace.state) || states.paused.includes(workspace.state)));
}
