import configWarning from './configWarning.js';

// A non-negative number from the environment, such as a price, where 0 is allowed. Empty or missing gets the
// default (which may be null, for unset); anything else that isn't a plain decimal gets the
// default with a startup warning.
export default function envAmount(name, fallback) {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  configWarning(`${name}=${raw} isn’t a plain decimal number like 4 or 0.25. ${fallback === null ? 'Leaving it unset.' : `Using the default, ${fallback}.`}`);
  return fallback;
}
