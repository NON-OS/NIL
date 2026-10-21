import type AiProviderSummary from '../types/AiProviderSummary';

// One sentence on where built-in AI requests go and with whose key, for every disclosure.
export default function aiDestination(provider: AiProviderSummary) {
  return provider.source === 'workspace' ? `This workspace sends AI requests to ${provider.name} with its own key.` : `This server sends AI requests to ${provider.name} with the key its operator set.`;
}
