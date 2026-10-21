import config from '../../config.js';
import resolveTarget from './resolveTarget.js';
import pinnedRequest from './pinnedRequest.js';

// The only way agent code reaches the network: webhooks and OpenAI-compatible model endpoints.
// It refuses private, loopback, link-local and metadata addresses unless local endpoints are
// allowed, resolves DNS once and connects to the address it checked, through EGRESS_PROXY when
// the server has one. `resolve` and `transport` are replaceable so tests can prove the pinning
// without touching the network.
export default async function safeFetch(url, { allowLocal = config.agents.allowLocalEndpoints, resolve, transport, proxy = config.agents.egressProxy, ...request } = {}) {
  const target = await resolveTarget(url, { allowLocal, resolve });
  return pinnedRequest(target, { ...request, transport, proxy });
}
