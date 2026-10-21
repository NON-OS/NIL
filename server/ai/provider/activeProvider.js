import config from '../../config.js';
import aiProvider from './aiProvider.js';

// The provider built-in AI uses right now: the workspace's own, or the server's default on a
// self-hosted server that set one, or null. `source` says whose key it is. A workspace's own
// provider needs a route out to reach it (AGENT_OUTBOUND); the server's default is the operator's
// to have made reachable.
export default function activeProvider() {
  const row = aiProvider.row();
  if (row && config.agents.outbound) {
    const baseUrl = row.kind === 'anthropic' ? config.ai.anthropicUrl : row.kind === 'openai' ? config.ai.openaiUrl : row.base_url;
    return { source: 'workspace', kind: row.kind, baseUrl, model: row.model, apiKey: aiProvider.open(row) };
  }
  if (config.ai.enabled) return { source: 'server', kind: 'anthropic', baseUrl: null, model: config.ai.model, apiKey: null };
  return null;
}
