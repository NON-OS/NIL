import appSite from './appSite.js';

// Origins allowed to make changes: APP_URL, plus any extra ones listed in ALLOWED_ORIGINS.
const origins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
origins.push(appSite.origin);

export default Object.freeze(origins);
