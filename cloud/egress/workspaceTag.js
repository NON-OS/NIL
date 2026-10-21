// Which workspace a tunnel is for, from the user name the control plane put in its EGRESS_PROXY
// address. Only ever a label for the log: a workspace could claim another's name, so limits go by
// the connection's own address instead.
export default function workspaceTag(header) {
  const match = /^Basic\s+([A-Za-z0-9+/=]+)$/.exec(String(header ?? '').trim());
  if (!match) return 'unknown';
  const user = Buffer.from(match[1], 'base64').toString('utf8').split(':')[0];
  return /^[a-z0-9]{1,32}$/.test(user) ? user : 'unknown';
}
