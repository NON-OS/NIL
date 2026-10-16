import configWarning from '../lib/configWarning.js';

// "12" or "12.50" as micro-USD (USDC's precision). Null for anything else.
function microUsd(value) {
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
}

// A price setting in US dollars, as micro-USD.
export default function envUsd(name, fallback, { positive = false } = {}) {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return microUsd(fallback);
  const value = microUsd(raw);
  if (value !== null && (!positive || value > 0)) return value;
  configWarning(`${name}=${raw} isn’t an amount of US dollars${positive ? ' above zero' : ''}, like 12 or 12.50. Using the default, ${fallback}.`);
  return microUsd(fallback);
}
