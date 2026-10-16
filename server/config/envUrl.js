import configWarning from '../lib/configWarning.js';

// An http or https address, or nothing.
export default function envUrl(name) {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return null;
  try {
    if (['http:', 'https:'].includes(new URL(raw).protocol)) return raw;
  } catch {}
  configWarning(`${name} isn’t an http or https address. Leaving it unset.`);
  return null;
}
