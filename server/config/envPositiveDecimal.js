import configWarning from '../lib/configWarning.js';

// A positive decimal like 0.0042, kept as text so no precision is lost on the way to BigInt.
export default function envPositiveDecimal(name, fallback) {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  if (/^\d{1,12}(\.\d{1,18})?$/.test(raw) && /[1-9]/.test(raw)) return raw;
  configWarning(`${name}=${raw} isn’t a positive decimal number. ${fallback ? `Using the default, ${fallback}.` : 'Leaving it unset.'}`);
  return fallback;
}
