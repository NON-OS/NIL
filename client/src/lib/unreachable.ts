import ApiError from '../api/ApiError';

// What a proxy in front of Nil answers while Nil itself is down or restarting.
const GATEWAY = new Set([502, 503, 504]);

// Whether a request never got an answer from Nil: no network, or a proxy saying Nil is down.
// That's being offline, which is different from being signed out.
export default function unreachable(err: unknown) {
  return err instanceof ApiError && (err.status === 0 || GATEWAY.has(err.status));
}
