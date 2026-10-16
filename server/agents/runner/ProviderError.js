// A model call that failed. `transient` errors (rate limits, overloaded or unreachable servers,
// timeouts) are worth retrying later; the rest won't fix themselves. The message is written for
// the admin and the team, never with a key or a raw response body in it.
export default class ProviderError extends Error {
  constructor(message, { transient = false, status = null } = {}) {
    super(message);
    this.transient = transient;
    this.status = status;
  }
}
