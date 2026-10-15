import Anthropic from '@anthropic-ai/sdk';

export default function friendlyError(err) {
  if (err.userMessage) return { status: 502, message: err.userMessage };
  if (err instanceof Anthropic.AuthenticationError) return { status: 503, message: 'The server’s AI key is invalid. An admin needs to update ANTHROPIC_API_KEY.' };
  if (err instanceof Anthropic.PermissionDeniedError) return { status: 503, message: 'The server’s AI key isn’t allowed to use this model.' };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: 'AI is busy right now. Try again in a minute.' };
  if (err instanceof Anthropic.BadRequestError) return { status: 502, message: 'The AI request was rejected. Try shorter input.' };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: 'The server couldn’t reach the AI service.' };
  if (err instanceof Anthropic.APIError) return { status: 502, message: 'The AI service had a problem. Try again shortly.' };
  return { status: 500, message: 'AI assist failed. Try again.' };
}
