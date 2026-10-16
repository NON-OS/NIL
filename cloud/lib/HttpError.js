export default class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }

  static badRequest(message) {
    return new HttpError(400, message);
  }

  static forbidden(message) {
    return new HttpError(403, message);
  }

  static tooMany(message, retryAfterSec) {
    return new HttpError(429, message, { retryAfterSec });
  }
}
