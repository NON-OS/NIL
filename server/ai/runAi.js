import HttpError from '../lib/HttpError.js';
import log from '../lib/log.js';
import friendlyError from './friendlyError.js';

// Runs one call to the AI provider and turns its failures into answers people can act on. Only
// the error is logged, never the request, and never who sent it.
export default async function runAi(work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const { status, message } = friendlyError(err);
    if (status >= 500 && !err.userMessage) log.warn('ai', 'An AI request failed.', err);
    throw new HttpError(status, message);
  }
}
