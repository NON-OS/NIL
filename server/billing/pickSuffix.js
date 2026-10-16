import crypto from 'node:crypto';
import permute from './permute.js';

const DRAWS = 32;

// A suffix no live invoice here uses. With a slot, it comes from this server's share of the
// suffix space (shuffled with the key, when there is one), so no other workspace on the same
// treasury can ever be handed the same one. Without a slot it is drawn at random. Null when
// every suffix in the share is taken.
export default function pickSuffix(taken, { digits, slot = null, key = null }, random = crypto.randomInt) {
  const space = 10 ** digits - 1;
  const capacity = slot ? Math.floor(space / slot.count) : space;
  const offset = slot ? slot.index * capacity : 0;
  const at = (r) => (key ? permute(1 + offset + r, digits, key) : 1 + offset + r);

  for (let i = 0; i < DRAWS; i++) {
    const suffix = at(random(capacity));
    if (!taken.has(suffix)) return suffix;
  }
  // nearly full: look through the whole share for a gap
  for (let r = 0; r < capacity; r++) {
    const suffix = at(r);
    if (!taken.has(suffix)) return suffix;
  }
  return null;
}
