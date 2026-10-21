import activeProvider from '../../ai/provider/activeProvider.js';
import anthropicProvider from './anthropicProvider.js';
import openaiProvider from './openaiProvider.js';
import ProviderError from './ProviderError.js';

// An agent on the workspace's own AI provider, read when the run starts, so a change in
// Settings → Connect AI reaches every such agent at once.
export default function workspaceRunner(agent) {
  const provider = activeProvider();
  if (!provider) throw new ProviderError('This workspace has no AI provider. An admin can choose one in Settings → Connect AI.');
  if (provider.source === 'workspace' && !provider.apiKey && provider.kind !== 'compatible') throw new ProviderError('This server can’t read the workspace’s AI key. An admin can enter it again in Settings → Connect AI.');
  const model = agent.model || provider.model;
  if (provider.kind === 'anthropic') {
    return anthropicProvider({ ...agent, model }, provider.source === 'server' ? null : { apiKey: provider.apiKey, baseUrl: provider.baseUrl, source: 'workspace' });
  }
  return openaiProvider({ ...agent, model, endpoint: provider.baseUrl, apiKey: provider.apiKey, apiKeyCt: null });
}
