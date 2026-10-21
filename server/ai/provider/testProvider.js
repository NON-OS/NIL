import config from '../../config.js';
import ask from '../ask.js';
import friendlyError from '../friendlyError.js';
import aiProvider from './aiProvider.js';
import keyFits from './keyFits.js';

// One tiny request to a provider, before or after it's saved, so an admin knows the key and model
// work. With no `apiKey` the saved key is used, but only for the provider it was saved for.
export default async function testProvider({ kind, baseUrl, model, apiKey }) {
  if (!config.agents.outbound) return { ok: false, error: 'This server has no route out to the internet yet, so it can’t reach an AI provider.' };
  const saved = aiProvider.row();
  const key = apiKey ?? (keyFits(saved, kind, baseUrl) ? aiProvider.open(saved) : null);
  if (!key && kind !== 'compatible') return { ok: false, error: 'Add the API key for this provider.' };
  const url = kind === 'anthropic' ? config.ai.anthropicUrl : kind === 'openai' ? config.ai.openaiUrl : baseUrl;
  const started = Date.now();
  try {
    const reply = await ask({ prompt: 'Reply with the single word OK.' }, { source: 'workspace', kind, baseUrl: url, model, apiKey: key });
    return { ok: true, reply: String(reply).slice(0, 60), ms: Date.now() - started };
  } catch (err) {
    err.source ??= 'workspace';
    return { ok: false, error: friendlyError(err).message };
  }
}
