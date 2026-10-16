import apiToken from '../auth/apiToken.js';
import plan from '../services/plan.js';
import agentPrincipal from './agentPrincipal.js';
import agentBlocked from './agentBlocked.js';

const PLAN = { status: 402, code: 'plan_required', message: 'Connecting AI assistants and agents needs Nil Pro.' };

// The caller behind an MCP or agent API request: a person through their personal access key, or
// an agent through its own key. Cookies are never looked at, so a web page can't ride a
// signed-in browser into either endpoint.
export default function principalFromRequest(req) {
  const auth = apiToken(req);
  if (!auth) return { error: { status: 401, code: 'unauthorized', message: 'Send a Nil access key as "Authorization: Bearer nonos_pat_…" or an agent key ("nonos_agt_…").' } };
  if (auth.user.kind !== 'agent') {
    if (!plan.status().unlocked) return { error: PLAN };
    return { principal: { user: auth.user, scope: auth.scope, agent: null, tokenId: auth.tokenId, key: `token:${auth.tokenId}` } };
  }
  const principal = agentPrincipal(auth.user.id);
  const blocked = agentBlocked(principal?.agent);
  if (blocked) return { error: blocked };
  return { principal: { ...principal, tokenId: auth.tokenId, key: `agent:${principal.agent.id}` } };
}
