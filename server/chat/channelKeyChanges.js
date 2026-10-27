import config from '../config.js';
import units from '../config/units.js';
import HttpError from '../lib/HttpError.js';

const counts = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, c] of counts) if (c.reset < now) counts.delete(k);
}, units.MINUTE).unref();

// New epochs a conversation took in the last minute, counted once each is accepted, so a member
// sending requests that are refused anyway can't use up what the others need. Throws when the
// conversation has had CHAT_KEY_CHANGES_PER_MINUTE already; otherwise counts this one.
export default function channelKeyChanges(channelId) {
  const now = Date.now();
  let c = counts.get(channelId);
  if (!c || c.reset < now) {
    c = { count: 0, reset: now + units.MINUTE };
    counts.set(channelId, c);
  }
  if (c.count >= config.chat.keyChangesPerMinute) throw new HttpError(429, 'This conversation’s key changed a lot in the last minute. Wait a moment and try again.');
  c.count += 1;
}
