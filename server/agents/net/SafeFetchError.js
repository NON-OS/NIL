// A refused or failed outbound request, with a code the caller can act on and a message safe to
// show an admin: 'bad_url', 'blocked_address', 'dns', 'timeout', 'network', 'too_large'.
export default class SafeFetchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
