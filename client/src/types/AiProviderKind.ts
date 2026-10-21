// Who a workspace's built-in AI talks to: Anthropic, OpenAI, or any server that speaks OpenAI's
// chat completions (OpenRouter, Gemini, Groq, Mistral, a model on your own machine).
type AiProviderKind = 'anthropic' | 'openai' | 'compatible';
export default AiProviderKind;
