const LABEL = /^[a-z0-9-]+$/;
const SWAPS = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b' };

// Folds the usual tricks so "m3tamask", "meta-mask" and "1edger" still read as the word they
// imitate. A 1 can stand for i or l, so both readings are checked.
function readings(text) {
  const base = text.replace(/-/g, '');
  const swap = (one) => base.replace(/[0134578]/g, (c) => (c === '1' ? one : SWAPS[c]));
  return new Set([base, swap('i'), swap('l')]);
}

// Whether a workspace address is acceptable on its own, before looking at who holds what.
// Only ASCII letters, digits and single dashes: no punycode, so no look-alike Unicode names.
export default function nameCheck(input, { nameMin, nameMax, reserved, blocked, blockedParts = [] }) {
  const name = typeof input === 'string' ? input.trim().toLowerCase() : '';
  const no = (reason) => ({ ok: false, name, reason });
  if (!name) return no('Pick an address for your workspace.');
  if (!LABEL.test(name)) return no('Use lowercase letters, digits and dashes only.');
  if (name.length < nameMin) return no(`Use at least ${nameMin} characters.`);
  if (name.length > nameMax) return no(`Use at most ${nameMax} characters.`);
  if (name.startsWith('-') || name.endsWith('-')) return no('An address can’t start or end with a dash.');
  if (name.includes('--')) return no('Use single dashes.');
  if (/^\d+$/.test(name)) return no('Use at least one letter.');
  if (reserved.has(name)) return no('That address is reserved.');
  // deliberately vague: spelling out the rule would only help someone work around it
  const unavailable = no('That address isn’t available.');
  const words = blocked.map((w) => w.replace(/-/g, ''));
  for (const reading of readings(name)) {
    if (words.some((word) => reading.includes(word))) return unavailable;
  }
  for (const part of name.split('-')) {
    for (const reading of readings(part)) if (blockedParts.includes(reading)) return unavailable;
  }
  return { ok: true, name };
}
