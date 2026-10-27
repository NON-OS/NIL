import HttpError from '../lib/HttpError.js';
import config from '../config.js';

// A channel's disappearing-messages setting: null to keep messages, otherwise seconds, from a
// minute up to CHAT_MAX_DISAPPEAR_DAYS.
export default function disappearAfter(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 60 || value > config.chat.maxDisappearSeconds) throw HttpError.badRequest('Pick how long messages stay.');
  return value;
}
