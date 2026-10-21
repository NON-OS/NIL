import type AiProviderKind from './AiProviderKind';

// Who built-in AI sends text to, as every member sees it: the provider's name (or the address's
// host), the model, and whether it's the workspace's own key or the server's default.
export default interface AiProviderSummary {
  name: string;
  kind: AiProviderKind;
  model: string | null;
  source: 'workspace' | 'server';
}
