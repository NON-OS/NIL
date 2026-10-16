import config from '../config.js';

const allowed = (host) => config.push.services.some((entry) => (entry.startsWith('*.') ? host.endsWith(entry.slice(1)) : host === entry));

// A browser's push endpoint, as a URL the server may post to, or null. Only https on the default
// port, no credentials, and only the push services allowed in PUSH_SERVICES: a subscription
// must never be a way to make the server call into a private network.
export default function pushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  return allowed(url.hostname.toLowerCase()) ? url : null;
}
