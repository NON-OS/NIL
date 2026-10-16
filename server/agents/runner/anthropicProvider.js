import Anthropic from '@anthropic-ai/sdk';
import config from '../../config.js';
import friendlyError from '../../ai/friendlyError.js';
import ProviderError from './ProviderError.js';

const JSON_RETRIES = 2;
let client;

function asProviderError(err) {
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
    return new ProviderError(friendlyError(err).message, { transient: true, status: err.status ?? null });
  }
  if (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 408 || err.status === 409)) {
    return new ProviderError('Anthropic is busy right now.', { transient: true, status: err.status });
  }
  return new ProviderError(friendlyError(err).message, { status: err.status ?? null });
}

function stopOf(message) {
  if (message.stop_reason === 'refusal') return 'refusal';
  if (message.stop_reason === 'max_tokens') return 'max_tokens';
  return message.content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end';
}

// Claude through the official SDK. Each step streams (long answers never hit an HTTP timeout)
// and is read with finalMessage(). Thinking is adaptive, refusals fall back to Anthropic's
// recommended model server-side, and the stable prefix (tools, system prompt) plus the growing
// transcript are cached. The assistant's content goes back unchanged, thinking blocks included.
export default function anthropicProvider(agent) {
  client ??= new Anthropic();
  return {
    model: agent.model,

    start({ system, user, tools }) {
      return {
        system,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema, eager_input_streaming: true })),
        messages: [{ role: 'user', content: user }],
      };
    },

    async step(state, { signal, maxTokens }) {
      // an agent made while AGENT_MODEL was set, which has since been removed
      if (!agent.model) throw new ProviderError('This agent has no model name. Enter one in Settings → Agents, or set AGENT_MODEL on the server.');
      const params = {
        model: agent.model,
        max_tokens: maxTokens,
        system: state.system,
        tools: state.tools,
        messages: state.messages,
        cache_control: { type: 'ephemeral' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      };
      if (config.agents.thinking === 'adaptive') params.thinking = { type: 'adaptive' };
      if (config.agents.effort) params.output_config = { effort: config.agents.effort };

      // Tool input streams as it's generated, so a malformed input surfaces as a parse error
      // rather than an API error; the turn is then asked again, a couple of times at most.
      let message;
      for (let attempt = 0; ; attempt++) {
        try {
          message = await client.beta.messages.stream(params, { signal }).finalMessage();
          break;
        } catch (err) {
          if (signal?.aborted) throw err;
          if (err instanceof Anthropic.APIError || attempt >= JSON_RETRIES) throw err instanceof ProviderError ? err : asProviderError(err);
        }
      }

      state.messages.push({ role: 'assistant', content: message.content });
      const usage = message.usage ?? {};
      return {
        text: message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim(),
        calls: message.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input })),
        usage: { input: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0), output: usage.output_tokens ?? 0 },
        stop: stopOf(message),
      };
    },

    addResults(state, results) {
      state.messages.push({
        role: 'user',
        content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })),
      });
    },
  };
}
