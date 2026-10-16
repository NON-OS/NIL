export default class DockerError extends Error {
  constructor(status, message, path) {
    super(`Docker: ${message} (${status} on ${path})`);
    this.status = status;
    this.reason = message;
  }
}
