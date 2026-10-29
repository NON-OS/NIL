import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import turn from '../../calls/turn.mjs';
import demoDir from './demoDir.mjs';
import repoRoot from './repoRoot.mjs';

const world = createRequire(import.meta.url)('../../a11y/world.cjs');
const PORT = Number(process.env.NIL_DEMO_PORT || 3996);
const TURN_PORT = Number(process.env.NIL_DEMO_TURN_PORT || 34780);

const isFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer().once('error', () => resolve(false));
    probe.listen(port, () => probe.close(() => resolve(true)));
  });

// A fresh start forgets the workspace and everyone's sign-ins, but keeps the wallets and the
// generated files, which cost nothing to reuse.
function forget() {
  fs.rmSync(path.join(demoDir, 'data'), { recursive: true, force: true });
  for (const f of fs.readdirSync(demoDir)) if (/^state-\w+\.json$/.test(f)) fs.rmSync(path.join(demoDir, f));
}

// A real Nil server on a mock chain, with its data in the demo folder so seeding and screenshots
// can run separately against it, and a coturn relay when one is installed, so the Calls screen
// is set up the way a running server has it.
export default async function startServer({ keep = false } = {}) {
  if (!fs.existsSync(path.join(repoRoot, 'dist/index.html'))) throw new Error('Build the web app first: npm run build');
  // a server already on the port would answer the health check, and the seed would fill it
  if (!(await isFree(PORT))) throw new Error(`Port ${PORT} is taken. Stop what is on it, or pick another with NIL_DEMO_PORT.`);
  if (!keep) forget();
  const data = path.join(demoDir, 'data');
  fs.mkdirSync(data, { recursive: true });
  const relay = turn({ port: TURN_PORT });
  await relay?.start();
  const app = await world({ port: PORT, env: { DATA_DIR: data, ...(relay ? { TURN_URLS: relay.url, TURN_SECRET: relay.secret } : {}) } });
  const stop = () => (app.stop(), relay?.stop());
  if (!(await fetch(`${app.base}/healthz`).then((r) => r.ok, () => false))) {
    stop();
    throw new Error('The server did not start; its errors are above.');
  }
  fs.writeFileSync(path.join(demoDir, 'server.json'), JSON.stringify({ base: app.base, setupToken: app.setupToken }));
  return { base: app.base, setupToken: app.setupToken, relay: Boolean(relay), stop };
}
