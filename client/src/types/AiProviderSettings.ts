import type AiProviderKind from './AiProviderKind';

// The workspace's AI provider as admins edit it. The key itself never comes back, only whether
// one is saved and its last four characters.
export default interface AiProviderSettings {
  provider: {
    kind: AiProviderKind;
    baseUrl: string | null;
    model: string;
    keySet: boolean;
    keyTail: string | null;
    updatedAt: number;
  } | null;
  // false on a server with no route out yet: the provider can be saved, but nothing reaches it
  outbound: boolean;
  // the server has a default key of its own (self-hosted), used while the workspace has none
  serverDefault: boolean;
  allowLocalEndpoints: boolean;
}
