import dns from 'node:dns';
import net from 'node:net';
import addressCategory from './addressCategory.js';
import SafeFetchError from './SafeFetchError.js';

// Loopback and private networks are fine for a self-hosted agent when the admin allows them;
// link-local and cloud metadata addresses never are.
const LOCAL = new Set(['loopback', 'private']);

const defaultResolve = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

// Checks an outbound URL and resolves its host once. Every address the name resolves to has to
// be allowed, and the caller then connects to exactly the address checked here, so a DNS answer
// that changes between the check and the connection (rebinding) can't reach anything inside.
export default async function resolveTarget(raw, { allowLocal = false, resolve = defaultResolve } = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError('bad_url', 'That isn’t a valid URL.');
  }
  if (url.username || url.password) throw new SafeFetchError('bad_url', 'Put credentials in headers, not in the URL.');
  if (url.protocol !== 'https:' && !(allowLocal && url.protocol === 'http:')) {
    throw new SafeFetchError('bad_url', allowLocal ? 'Use an http or https URL.' : 'Use an https URL. Plain http is only allowed for local endpoints, which an admin has to switch on.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  if (net.isIP(hostname)) addresses = [{ address: hostname, family: net.isIP(hostname) }];
  else {
    try {
      addresses = await resolve(hostname);
    } catch {
      throw new SafeFetchError('dns', `Couldn’t find ${hostname} in DNS.`);
    }
  }
  if (!addresses?.length) throw new SafeFetchError('dns', `${hostname} has no address.`);
  for (const { address } of addresses) {
    const category = addressCategory(address);
    if (category && !(allowLocal && LOCAL.has(category))) {
      throw new SafeFetchError('blocked_address', `${hostname} points to a ${category} address, which this server won’t call.${LOCAL.has(category) ? ' An admin can allow local endpoints with AGENT_ALLOW_LOCAL_ENDPOINTS=true.' : ''}`);
    }
  }
  return { url, address: addresses[0].address, family: addresses[0].family };
}
