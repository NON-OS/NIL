export default class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }

  static badRequest(message) {
    return new HttpError(400, message);
  }

  static forbidden(message = 'You don’t have access to do that.') {
    return new HttpError(403, message);
  }

  static notFound(what = 'That item') {
    return new HttpError(404, `${what} no longer exists.`);
  }
}
