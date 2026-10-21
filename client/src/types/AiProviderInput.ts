import type AiProviderKind from './AiProviderKind';

// What Settings → Connect AI sends when it saves or tests a provider.
export default interface AiProviderInput {
  kind: AiProviderKind;
  baseUrl: string;
  model: string;
  // left out keeps the saved key
  apiKey?: string;
}
