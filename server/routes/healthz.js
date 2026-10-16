import sql from '../db/sql.js';
import config from '../config.js';
import appVersion from '../lib/appVersion.js';
import logLimited from '../lib/logLimited.js';
import jobState from '../jobs/jobState.js';
import rpcHealth from '../chain/rpcHealth.js';

// For Docker, load balancers and uptime checks, and anyone can call it. It answers 503 when the
// database doesn't answer. Everything else is for an operator glancing at it: versions, when each
// job last ran, whether the Ethereum node answered lately. Nothing in it names the workspace,
// its people, file paths or settings.
export default function healthz(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let schema;
  try {
    sql.get('SELECT 1');
    schema = sql.get('PRAGMA user_version').user_version;
  } catch (err) {
    logLimited('healthz:db', 'error', 'health', 'The database didn’t answer the health check.', err);
    return res.status(503).json({ ok: false, version: appVersion });
  }
  res.json({
    ok: true,
    version: appVersion,
    schema,
    jobs: jobState.report(),
    chain: config.nox.enabled ? { enabled: true, ...rpcHealth.report() } : { enabled: false },
  });
}
