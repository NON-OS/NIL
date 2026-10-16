const UNITS = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4 };

// "768m", "2g", "512k" or plain bytes, the way Docker writes sizes. Returns null when it can't
// be read, so the caller decides whether that is fatal.
export default function parseBytes(value) {
  const match = /^(\d+(?:\.\d+)?)\s*([kmgt]?)i?b?$/i.exec(String(value ?? '').trim());
  if (!match) return null;
  const bytes = Math.round(Number(match[1]) * UNITS[match[2].toLowerCase()]);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
}
