import activeProvider from './provider/activeProvider.js';
import AiError from './AiError.js';
import askAnthropic from './askAnthropic.js';
import askOpenAi from './askOpenAi.js';

// One request to the workspace's AI provider, or the server's default. With a schema the reply is
// parsed JSON, otherwise text. A failure carries whose key it was, so the message points at the
// right fix (friendlyError.js).
export default async function ask(request, provider = activeProvider()) {
  if (!provider) throw new AiError('AI assist is off. An admin can choose an AI provider and add its key in Settings → Connect AI.', 503);
  if (provider.source === 'workspace' && !provider.apiKey && provider.kind !== 'compatible') {
    throw new AiError('This workspace’s AI key can’t be read. An admin can enter it again in Settings → Connect AI.', 503);
  }
  try {
    return await (provider.kind === 'anthropic' ? askAnthropic : askOpenAi)(provider, request);
  } catch (err) {
    err.source ??= provider.source;
    throw err;
  }
}
