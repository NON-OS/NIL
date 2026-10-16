import configWarning from './configWarning.js';

// A whole number from the environment. An empty value counts as unset and gets the default, the
// same as a missing one, never 0. A value that isn't a whole number in range gets the default
// too, with a warning at startup.
export default function envNumber(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (value >= min && value <= max) return value;
  const range = max < Number.MAX_SAFE_INTEGER ? ` from ${min} to ${max}` : min > 0 ? ` of at least ${min}` : '';
  configWarning(`${name}=${raw} isn’t a whole number${range}. Using the default, ${fallback}.`);
  return fallback;
}
