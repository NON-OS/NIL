import Anthropic from '@anthropic-ai/sdk';
import config from '../config.js';
import AiError from './AiError.js';
import assistantSystem from './assistantSystem.js';
import jsonFromText from './jsonFromText.js';
import proxiedFetch from '../agents/net/proxiedFetch.js';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
// what a model or an account can turn down; the request is then asked again without it
const OPTIONAL = /fallback|output_config|effort|json_schema|format|beta/i;
const VARIANTS = [
  { fallbacks: true, effort: true, format: true },
  { fallbacks: false, effort: true, format: true },
  { fallbacks: false, effort: false, format: true },
  { fallbacks: false, effort: false, format: false },
];
let serverClient;

function clientFor(provider) {
  const options = { timeout: config.ai.timeoutMs, maxRetries: config.ai.maxRetries };
  // the server's default reads ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL as the operator set them
  if (provider.source === 'server') return (serverClient ??= new Anthropic(options));
  // nothing of the operator's (ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL) goes with a workspace's key
  return new Anthropic({ ...options, apiKey: provider.apiKey, authToken: null, baseURL: provider.baseUrl, fetch: proxiedFetch });
}

function paramsFor(provider, { prompt, schema, effort }, v) {
  const outputConfig = {};
  if (v.effort) outputConfig.effort = effort;
  if (schema && v.format) outputConfig.format = { type: 'json_schema', schema };
  const content = schema && !v.format ? `${prompt}\n\nReply with only a JSON object that matches this JSON schema:\n${JSON.stringify(schema)}` : prompt;
  const params = { model: provider.model, max_tokens: config.ai.maxOutputTokens, system: assistantSystem, messages: [{ role: 'user', content }] };
  if (Object.keys(outputConfig).length) params.output_config = outputConfig;
  if (v.fallbacks) Object.assign(params, { betas: [FALLBACK_BETA], fallbacks: 'default' });
  return params;
}

// One request to Claude. The newest settings go first (server-side fallbacks, effort, a JSON
// schema), and each one a model or an account turns down is dropped for a plainer request, down to
// asking for JSON in words, so an older model or a restricted key still answers.
export default async function askAnthropic(provider, { prompt, schema, effort = 'low' }) {
  const client = clientFor(provider);
  const variants = schema ? VARIANTS : VARIANTS.slice(0, 3);
  let response;
  for (const [i, v] of variants.entries()) {
    try {
      response = await client.beta.messages.create(paramsFor(provider, { prompt, schema, effort }, v));
      break;
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError && OPTIONAL.test(err.message) && i < variants.length - 1) continue;
      throw err;
    }
  }

  if (response.stop_reason === 'refusal') throw new AiError('Claude declined this request. Rephrase it and try again.');
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (!schema) return text;
  const parsed = jsonFromText(text);
  if (parsed === null) throw new AiError(response.stop_reason === 'max_tokens' ? 'The answer got too long. Try with less text.' : 'Claude returned something unexpected. Try again.');
  return parsed;
}
