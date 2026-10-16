import configWarning from '../lib/configWarning.js';

// A yes-or-no setting: true, 1, yes and on, or false, 0, no and off.
export default function envFlag(name, fallback) {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', 'yes', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'off'].includes(raw)) return false;
  configWarning(`${name}=${raw} isn’t true or false. Using the default, ${fallback}.`);
  return fallback;
}
