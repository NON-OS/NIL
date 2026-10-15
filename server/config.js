import path from 'node:path';

const env = process.env;

const origins = (env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
if (env.APP_URL) origins.push(env.APP_URL.replace(/\/$/, ''));

function trustProxy(value) {
  if (!value) return false;
  if (value === 'true') return true;
  const hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
}

const config = Object.freeze({
  port: Number(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR || './data'),
  dbFile: env.DB_FILE || null,
  trustProxy: trustProxy(env.TRUST_PROXY),
  appUrl: env.APP_URL ? env.APP_URL.replace(/\/$/, '') : null,
  sourceUrl: env.SOURCE_URL || null,
  allowedOrigins: Object.freeze(origins),
  maxUploadBytes: Number(env.MAX_UPLOAD_MB || 25) * 1024 * 1024,
  sessionDays: Number(env.SESSION_DAYS || 30),
  trashDays: Number(env.TRASH_DAYS || 30),
  ai: Object.freeze({
    enabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  }),
});

export default config;
