import config from '../../config.js';
import secretBox from '../secretBox.js';
import safeFetch from '../net/safeFetch.js';
import SafeFetchError from '../net/SafeFetchError.js';
import ProviderError from './ProviderError.js';

const RESPONSE_CAP = 8 * 1024 * 1024;

// "http://localhost:11434/v1" and ".../v1/chat/completions" both mean the same endpoint.
const completionsUrl = (endpoint) => (/\/chat\/completions\/?$/.test(endpoint) ? endpoint : `${endpoint.replace(/\/+$/, '')}/chat/completions`);

function stopOf(choice, calls) {
  if (choice.finish_reason === 'content_filter') return 'refusal';
  if (choice.finish_reason === 'length') return 'max_tokens';
  return calls.length ? 'tool_use' : 'end';
}

function openKey(sealed) {
  if (!sealed) return null;
  try {
    return secretBox.open(sealed);
  } catch {
    throw new ProviderError('This server can’t read the saved API key. Enter it again in Settings → Agents.');
  }
}

function errorFrom(res) {
  let detail = '';
  try {
    detail = String(res.json()?.error?.message ?? '').slice(0, 200);
  } catch {}
  const transient = res.status === 429 || res.status >= 500;
  return new ProviderError(`The model endpoint answered ${res.status}${detail ? `: ${detail}` : '.'}`, { transient, status: res.status });
}

// Any OpenAI-compatible chat completions server with tool calling: Ollama, vLLM, LM Studio,
// OpenRouter and the like, over plain HTTP with no SDK. Requests go through safeFetch, so a local
// model works only where the admin allowed local endpoints, and metadata addresses never do.
export default function openaiProvider(agent) {
  const apiKey = openKey(agent.apiKeyCt);
  const url = completionsUrl(agent.endpoint ?? '');
  return {
    model: agent.model,

    start({ system, user, tools }) {
      return {
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      };
    },

    async step(state, { signal, maxTokens }) {
      let res;
      try {
        res = await safeFetch(url, {
          method: 'POST',
          signal,
          timeoutMs: config.agents.runTimeoutMs,
          maxBytes: RESPONSE_CAP,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify({ model: agent.model, messages: state.messages, tools: state.tools, tool_choice: 'auto', max_tokens: maxTokens }),
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        if (err instanceof SafeFetchError) throw new ProviderError(err.message, { transient: ['timeout', 'network', 'dns'].includes(err.code) });
        throw err;
      }
      if (res.status >= 400) throw errorFrom(res);
      let data;
      try {
        data = res.json();
      } catch {
        throw new ProviderError('The model endpoint sent something that isn’t JSON.', { transient: true });
      }
      const choice = data.choices?.[0];
      if (!choice?.message) throw new ProviderError('The model endpoint sent no answer.', { transient: true });

      const calls = (choice.message.tool_calls ?? []).map((call, i) => {
        const id = call.id || `call_${state.messages.length}_${i}`;
        try {
          return { id, name: call.function?.name, input: JSON.parse(call.function?.arguments || '{}') };
        } catch {
          return { id, name: call.function?.name, input: null, error: call.function?.arguments ?? '' };
        }
      });
      state.messages.push({
        role: 'assistant',
        content: choice.message.content ?? null,
        ...(calls.length ? { tool_calls: calls.map((c, i) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: choice.message.tool_calls[i].function?.arguments ?? '{}' } })) } : {}),
      });
      return {
        text: String(choice.message.content ?? '').trim(),
        calls,
        usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 },
        stop: stopOf(choice, calls),
      };
    },

    addResults(state, results) {
      for (const r of results) state.messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
    },
  };
}
