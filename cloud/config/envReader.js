// Reads settings the way the app does: an empty value counts as unset, and a value that is set
// but can't be used gets the default with a warning, so a typo never changes behaviour silently.
// Missing required settings are collected rather than thrown one by one, so the operator sees
// every problem in a single start instead of fixing them across several restarts.
export default function envReader(env) {
  const warnings = [];
  const errors = [];
  const raw = (name) => String(env[name] ?? '').trim();

  return {
    warnings,
    errors,
    raw,
    warn: (message) => warnings.push(message),
    fail: (message) => errors.push(message),

    text(name, fallback = null) {
      return raw(name) || fallback;
    },

    required(name, hint) {
      const value = raw(name);
      if (!value) errors.push(`${name} is not set. ${hint}`);
      return value || null;
    },

    number(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
      const value = raw(name);
      if (!value) return fallback;
      const n = /^\d+$/.test(value) ? Number(value) : NaN;
      if (n >= min && n <= max) return n;
      warnings.push(`${name}=${value} isn’t a whole number from ${min} to ${max}. Using the default, ${fallback}.`);
      return fallback;
    },

    bool(name, fallback) {
      const value = raw(name).toLowerCase();
      if (!value) return fallback;
      if (['1', 'true', 'yes', 'on'].includes(value)) return true;
      if (['0', 'false', 'no', 'off'].includes(value)) return false;
      warnings.push(`${name}=${value} isn’t yes or no. Using the default, ${fallback ? 'yes' : 'no'}.`);
      return fallback;
    },

    oneOf(name, options, fallback) {
      const value = raw(name).toLowerCase();
      if (!value) return fallback;
      if (options.includes(value)) return value;
      warnings.push(`${name}=${value} isn’t one of ${options.join(', ')}. Using the default, ${fallback}.`);
      return fallback;
    },

    list(name) {
      return raw(name)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    },

    // The value isn't repeated in the warning: URLs often carry credentials or API keys.
    url(name, { protocols = ['https:'], fallback = null } = {}) {
      const value = raw(name);
      if (!value) return fallback;
      try {
        const url = new URL(value);
        if (protocols.includes(url.protocol)) return value.replace(/\/+$/, '');
      } catch {}
      warnings.push(`${name} isn’t a valid ${protocols.join(' or ').replace(/:/g, '')} address. It’s ignored.`);
      return fallback;
    },
  };
}
