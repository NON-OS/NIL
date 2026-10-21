const NAMES = { anthropic: 'Anthropic', openai: 'OpenAI' };

// The provider as people should read it in a disclosure: Anthropic, OpenAI, or the host of an
// OpenAI-compatible endpoint, such as openrouter.ai.
export default function providerName(kind, baseUrl) {
  if (NAMES[kind]) return NAMES[kind];
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'an OpenAI-compatible provider';
  }
}
