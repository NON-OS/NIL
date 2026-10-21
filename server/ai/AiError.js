// A built-in AI failure with the sentence to show people, and the HTTP status that fits it.
export default class AiError extends Error {
  constructor(userMessage, status = 502) {
    super(userMessage);
    this.userMessage = userMessage;
    this.status = status;
  }
}
