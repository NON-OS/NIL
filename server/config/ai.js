import envNumber from '../lib/envNumber.js';
import configWarning from '../lib/configWarning.js';
import units from './units.js';

// Built-in AI (drafting, decks). No model is assumed: model names change faster than this code,
// so it stays off until ANTHROPIC_MODEL names one.
const env = process.env;
const hasKey = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
const model = (env.ANTHROPIC_MODEL ?? '').trim() || null;
if (hasKey && !model) {
  const agentsToo = (env.AGENT_MODEL ?? '').trim() ? '' : ' Built-in agents on Anthropic need a model name too: set AGENT_MODEL, or enter one on each agent.';
  configWarning(`An Anthropic key is set, but ANTHROPIC_MODEL isn’t, so built-in AI stays off. Set ANTHROPIC_MODEL to the name of the Anthropic model to use.${agentsToo}`);
}

export default Object.freeze({
  enabled: hasKey && Boolean(model),
  // the key alone is enough for built-in agents, which can name their own model
  hasKey,
  model,
  // a hard stop per attempt; retries cover rate limits and brief outages
  timeoutMs: envNumber('AI_TIMEOUT_SECONDS', 120, { min: 1 }) * units.SECOND,
  maxRetries: envNumber('AI_MAX_RETRIES', 1, { max: 10 }),
  // per member, in both modes: signed in, and anonymous where each request spends one of the day's slots
  perMinute: envNumber('AI_REQUESTS_PER_MINUTE', 12, { min: 1 }),
  perDay: envNumber('AI_REQUESTS_PER_DAY', 100, { min: 1, max: 1000 }),
});
