import envNumber from '../lib/envNumber.js';
import configWarning from '../lib/configWarning.js';
import envUrl from './envUrl.js';
import units from './units.js';

// Built-in AI (drafting, decks). Each workspace normally brings its own provider and key, set by
// an admin in Settings → Connect AI (ai/provider). ANTHROPIC_API_KEY and ANTHROPIC_MODEL are an optional
// default for a self-hosted server, used while a workspace has none of its own. No model is
// assumed: model names change faster than this code.
const env = process.env;
const hasKey = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
const model = (env.ANTHROPIC_MODEL ?? '').trim() || null;
if (hasKey && !model) {
  const agentsToo = (env.AGENT_MODEL ?? '').trim() ? '' : ' Built-in agents on Anthropic need a model name too: set AGENT_MODEL, or enter one on each agent.';
  configWarning(`An Anthropic key is set, but ANTHROPIC_MODEL isn’t, so built-in AI stays off. Set ANTHROPIC_MODEL to the name of the Anthropic model to use.${agentsToo}`);
}

export default Object.freeze({
  // the server's default; whether a workspace has AI at all is ai/provider/aiAvailable.js
  enabled: hasKey && Boolean(model),
  // the key alone is enough for built-in agents, which can name their own model
  hasKey,
  model,
  // where a workspace's own key is sent, for Anthropic and for OpenAI; an OpenAI-compatible
  // provider brings its own address
  anthropicUrl: envUrl('AI_ANTHROPIC_URL') ?? 'https://api.anthropic.com',
  openaiUrl: envUrl('AI_OPENAI_URL') ?? 'https://api.openai.com/v1',
  maxOutputTokens: envNumber('AI_MAX_OUTPUT_TOKENS', 16000, { min: 256, max: 128_000 }),
  // a hard stop per attempt; retries cover rate limits and brief outages
  timeoutMs: envNumber('AI_TIMEOUT_SECONDS', 120, { min: 1 }) * units.SECOND,
  maxRetries: envNumber('AI_MAX_RETRIES', 1, { max: 10 }),
  // per member, in both modes: signed in, and anonymous where each request spends one of the day's slots
  perMinute: envNumber('AI_REQUESTS_PER_MINUTE', 12, { min: 1 }),
  perDay: envNumber('AI_REQUESTS_PER_DAY', 100, { min: 1, max: 1000 }),
});
