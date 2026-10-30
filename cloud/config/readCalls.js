import path from 'node:path';

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// Calls in hosted workspaces. A call goes through the relay (the turn service in
// docker-compose.yml), so nobody in it learns anyone else's IP address, and each workspace logs
// in to the relay with a secret of its own: made from CLOUD_TURN_SECRET and the workspace's id,
// and listed in the database the relay checks while the workspace runs, and only then. Off,
// every workspace has calls off, whatever the workspace env file says.
export default function readCalls(read, { domain, tls }) {
  if (read.oneOf('CLOUD_CALLS', ['on', 'off'], 'off') === 'off') return null;
  const secret = read.text('CLOUD_TURN_SECRET');
  if (!secret || secret.length < 32) {
    read.fail('CLOUD_CALLS=on needs CLOUD_TURN_SECRET, at least 32 characters, that each workspace’s relay secret is made from. Make one with: openssl rand -hex 32');
    return null;
  }
  const host = read.text('CLOUD_TURN_HOST', `turn.${domain}`);
  if (!HOST.test(host)) {
    read.fail('CLOUD_TURN_HOST must be the relay’s host name, such as turn.nil.example.com.');
    return null;
  }
  // the relay takes Caddy's wildcard certificate, which covers names one level below the domain
  const certified = tls === 'wildcard' && host.endsWith(`.${domain}`) && !host.slice(0, -domain.length - 1).includes('.');
  if (!certified) read.warn(`The relay has no certificate for ${host}: it takes Caddy’s wildcard one, so set CLOUD_TLS=wildcard and keep CLOUD_TURN_HOST one name below ${domain}. Until then it listens without TLS, and people on networks that only let HTTPS through can’t join calls.`);
  return Object.freeze({
    host,
    secret,
    urls: Object.freeze([...(certified ? [`turns:${host}:5349?transport=tcp`] : []), `turn:${host}:3478?transport=udp`]),
    // coturn's own SQLite database, on a volume the relay and the control plane share
    db: path.resolve(read.text('CLOUD_TURN_DB', '/var/lib/nil-turn/turndb')),
    container: read.text('CLOUD_TURN_CONTAINER', 'nil-turn'),
    // the certificate as Caddy keeps it, in Caddy's container: the relay restarts when it changes
    certificate: certified ? read.text('CLOUD_TURN_CERTIFICATE', `/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/wildcard_.${domain}/wildcard_.${domain}.crt`) : null,
  });
}
