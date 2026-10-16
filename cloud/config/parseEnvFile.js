import fs from 'node:fs';

// Settings the control plane owns for every workspace. Letting the shared env file override them
// would break routing, data placement or the setup claim, so those lines are refused.
const MANAGED = new Set(['APP_URL', 'TRUST_PROXY', 'PLAN_TREASURY', 'SOURCE_URL', 'NOX_RPC_URL', 'SETUP_TOKEN', 'DATA_DIR', 'DB_FILE', 'PORT', 'HOST']);

// KEY=VALUE lines passed to every hosted workspace (for example PLAN_PRICE or PLAN_FREE_SEATS).
// Same rules as .env: comments on their own lines, no quotes needed.
export default function parseEnvFile(file, read) {
  if (!file) return Object.freeze({});
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    read.fail(`CLOUD_APP_ENV_FILE points at ${file}, which can’t be read.`);
    return Object.freeze({});
  }
  const env = {};
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    const key = eq > 0 ? trimmed.slice(0, eq).trim() : '';
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) return read.warn(`CLOUD_APP_ENV_FILE line ${index + 1} isn’t KEY=VALUE. It’s ignored.`);
    if (MANAGED.has(key)) return read.warn(`CLOUD_APP_ENV_FILE sets ${key}, which the control plane manages. It’s ignored.`);
    env[key] = trimmed.slice(eq + 1).trim();
  });
  return Object.freeze(env);
}
