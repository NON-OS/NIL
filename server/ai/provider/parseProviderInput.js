import config from '../../config.js';
import check from '../../lib/check.js';
import HttpError from '../../lib/HttpError.js';
import resolveTarget from '../../agents/net/resolveTarget.js';
import aiProvider from './aiProvider.js';
import keyFits from './keyFits.js';

const KINDS = ['anthropic', 'openai', 'compatible'];

// Checks a provider from Settings → Connect AI. An OpenAI-compatible one needs its address, which
// gets the same checks as an agent's endpoint, so nobody can point the server at an address inside
// its network. `apiKey` left out keeps the saved key; Anthropic and OpenAI need one, a local model
// may not.
export default async function parseProviderInput(body) {
  const kind = check.oneOf(body?.kind, KINDS, 'Provider');
  const model = check.text(body?.model, 'Model', { min: 1, max: 120 });
  let baseUrl = null;
  if (kind === 'compatible') {
    baseUrl = check.text(body?.baseUrl, 'Address', { min: 1, max: 500 });
    try {
      await resolveTarget(baseUrl, { allowLocal: config.agents.allowLocalEndpoints });
    } catch (err) {
      throw HttpError.badRequest(`Address: ${err.message}`);
    }
  }
  const apiKey = body?.apiKey === undefined || body?.apiKey === null ? undefined : check.text(body.apiKey, 'API key', { max: 500 }) || undefined;
  const fits = keyFits(aiProvider.row(), kind, baseUrl);
  if (kind !== 'compatible' && !apiKey && !fits) throw HttpError.badRequest('Add the API key for this provider.');
  return { kind, baseUrl, model, apiKey: apiKey ?? (fits ? undefined : null) };
}
