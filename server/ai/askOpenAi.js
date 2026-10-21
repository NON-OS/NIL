import config from '../config.js';
import AiError from './AiError.js';
import assistantSystem from './assistantSystem.js';
import jsonFromText from './jsonFromText.js';
import proxiedFetch from '../agents/net/proxiedFetch.js';

// "https://openrouter.ai/api/v1" and ".../v1/chat/completions" both mean the same endpoint
const completionsUrl = (base) => (/\/chat\/completions\/?$/.test(base) ? base : `${base.replace(/\/+$/, '')}/chat/completions`);
const REFUSED_LIMIT = /max_tokens|max_completion_tokens/i;
const REFUSED_FORMAT = /response_format|json_schema|json_object|structured/i;

function failure(status, detail) {
  if (status === 401 || status === 403) return new AiError('The AI provider refused the key. An admin can check it in Settings → Connect AI.', 503);
  if (status === 404) return new AiError('The AI provider doesn’t know that model or address. An admin can check them in Settings → Connect AI.', 503);
  if (status === 429) return new AiError('AI is busy right now. Try again in a minute.', 429);
  if (status === 400) return new AiError(`The AI request was rejected${detail ? `: ${detail}` : '. Try shorter input.'}`);
  return new AiError('The AI service had a problem. Try again shortly.');
}

async function post(provider, body) {
  const res = await proxiedFetch(completionsUrl(provider.baseUrl), {
    method: 'POST',
    signal: AbortSignal.timeout(config.ai.timeoutMs),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // an error page or a proxy's answer; the status says enough
  }
  return { status: res.status, data, detail: String(data?.error?.message ?? '').slice(0, 200) };
}

// One request to OpenAI or any server that speaks its chat completions API (OpenRouter, Gemini's
// OpenAI endpoint, Groq, Mistral, a local model). A reply that has to be JSON asks for the schema
// first, then for any JSON object, then for JSON in words, as far as the provider goes along, and
// the token limit goes when a provider won't take it under the name it was sent as.
export default async function askOpenAi(provider, { prompt, schema }) {
  const formats = schema ? [{ type: 'json_schema', json_schema: { name: 'answer', schema, strict: true } }, { type: 'json_object' }, null] : [null];
  let limit = provider.kind === 'openai' ? { max_completion_tokens: config.ai.maxOutputTokens } : { max_tokens: config.ai.maxOutputTokens };
  for (const [i, format] of formats.entries()) {
    const last = i === formats.length - 1;
    const content = schema && format?.type !== 'json_schema' ? `${prompt}\n\nReply with only a JSON object that matches this JSON schema:\n${JSON.stringify(schema)}` : prompt;
    const body = () => ({ model: provider.model, messages: [{ role: 'system', content: assistantSystem }, { role: 'user', content }], ...limit, ...(format ? { response_format: format } : {}) });
    let res = await post(provider, body());
    if (res.status === 400 && Object.keys(limit).length && REFUSED_LIMIT.test(res.detail)) {
      limit = {};
      res = await post(provider, body());
    }
    if (res.status === 400 && format && REFUSED_FORMAT.test(res.detail) && !last) continue;
    if (res.status >= 400) throw failure(res.status, res.detail);
    const choice = res.data?.choices?.[0];
    if (choice?.finish_reason === 'content_filter') throw new AiError('The AI declined this request. Rephrase it and try again.');
    const text = String(choice?.message?.content ?? '').trim();
    if (!schema) return text;
    const parsed = jsonFromText(text);
    if (parsed !== null) return parsed;
    if (!last) continue;
    throw new AiError(choice?.finish_reason === 'length' ? 'The answer got too long. Try with less text.' : 'The AI returned something unexpected. Try again.');
  }
  throw new AiError('The AI returned something unexpected. Try again.');
}
