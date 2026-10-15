import Anthropic from '@anthropic-ai/sdk';
import config from '../config.js';

const SYSTEM = `You are the planning assistant inside NONOS, a task system for a small, ambitious team.
Write plain, direct English. Prefer concrete, checkable steps over generic advice.
Never invent people, numbers or facts that aren't in the data you're given.`;

let client;

class AiError extends Error {
  constructor(userMessage) {
    super(userMessage);
    this.userMessage = userMessage;
  }
}

// One request to Claude. With a schema the reply is parsed JSON, otherwise text.
// `fallbacks: 'default'` reruns a declined request on Anthropic's recommended fallback model.
export default async function ask({ prompt, schema, effort = 'low' }) {
  client ??= new Anthropic();
  const output_config = schema ? { effort, format: { type: 'json_schema', schema } } : { effort };
  const response = await client.beta.messages.create({
    model: config.ai.model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config,
    messages: [{ role: 'user', content: prompt }],
  });

  if (response.stop_reason === 'refusal') throw new AiError('Claude declined this request. Rephrase it and try again.');
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (!schema) return text;
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError(response.stop_reason === 'max_tokens' ? 'The answer got too long. Try with less text.' : 'Claude returned something unexpected. Try again.');
  }
}
