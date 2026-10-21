import config from '../../config.js';
import secretBox from '../secretBox.js';
import aiProvider from '../../ai/provider/aiProvider.js';
import ProviderError from './ProviderError.js';

// Whose Anthropic key an agent on Anthropic runs with: its own, then the workspace's when the
// workspace's provider is Anthropic, then null for the server's default (ANTHROPIC_API_KEY).
export default function anthropicCreds(agent) {
  if (agent.apiKeyCt) {
    try {
      return { apiKey: secretBox.open(agent.apiKeyCt), baseUrl: config.ai.anthropicUrl, source: 'agent' };
    } catch {
      throw new ProviderError('This server can’t read the agent’s saved API key. Enter it again in Settings → Agents.');
    }
  }
  const workspace = aiProvider.row();
  if (workspace?.kind === 'anthropic' && config.agents.outbound) {
    const apiKey = aiProvider.open(workspace);
    if (!apiKey) throw new ProviderError('This server can’t read the workspace’s AI key. An admin can enter it again in Settings → Connect AI.');
    return { apiKey, baseUrl: config.ai.anthropicUrl, source: 'workspace' };
  }
  return null;
}
