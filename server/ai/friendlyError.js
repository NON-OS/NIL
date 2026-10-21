import Anthropic from '@anthropic-ai/sdk';
import SafeFetchError from '../agents/net/SafeFetchError.js';

const KEYS = {
  workspace: ['This workspace’s AI key', 'An admin can update it in Settings → Connect AI.'],
  agent: ['This agent’s API key', 'An admin can update it in Settings → Agents.'],
  server: ['The server’s AI key', 'An admin needs to update ANTHROPIC_API_KEY.'],
};

// the address check or the egress proxy that stopped a request, however deep fetch or the SDK
// wrapped it
function blockedBy(err) {
  for (let e = err, depth = 0; e && depth < 4; e = e.cause, depth++) if (e instanceof SafeFetchError) return e;
  return null;
}

// An AI failure as a sentence people can act on. `err.source` says whose key it was: the
// workspace's (Settings → Connect AI), an agent's own, or the server's default.
export default function friendlyError(err) {
  if (err.userMessage) return { status: err.status ?? 502, message: err.userMessage };
  const [key, fix] = KEYS[err.source] ?? KEYS.server;
  const blocked = blockedBy(err);
  if (blocked) return { status: blocked.code === 'timeout' ? 504 : 502, message: `The AI provider couldn’t be reached: ${blocked.message}` };
  if (err instanceof Anthropic.AuthenticationError) return { status: 503, message: `${key} is invalid. ${fix}` };
  if (err instanceof Anthropic.PermissionDeniedError) return { status: 503, message: `${key} isn’t allowed to use this model.` };
  if (err instanceof Anthropic.NotFoundError) return { status: 503, message: 'The AI provider doesn’t know that model name.' };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: 'AI is busy right now. Try again in a minute.' };
  if (err instanceof Anthropic.BadRequestError) return { status: 502, message: 'The AI request was rejected. Try shorter input.' };
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: 504, message: 'The AI service took too long to answer. Try again.' };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: 'The server couldn’t reach the AI service.' };
  if (err instanceof Anthropic.APIError) return { status: 502, message: 'The AI service had a problem. Try again shortly.' };
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return { status: 504, message: 'The AI service took too long to answer. Try again.' };
  // fetch() failing to connect at all
  if (err instanceof TypeError && err.cause) return { status: 502, message: 'The server couldn’t reach the AI service.' };
  return { status: 500, message: 'AI assist failed. Try again.' };
}
