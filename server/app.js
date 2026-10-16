import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.js';
import api from './routes/api.js';
import mcp from './routes/mcp.js';
import listedBounties from './services/listedBounties.js';
import csrfGuard from './security/csrfGuard.js';
import securityHeaders from './security/securityHeaders.js';
import signingKey from './proofs/signingKey.js';
import publicWorkspace from './services/publicWorkspace.js';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export default function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders);

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // Lets anyone confirm, from this domain, which key signs this workspace's proofs.
  app.get('/.well-known/nonos-proof-key', (req, res) => {
    const ws = publicWorkspace();
    if (!ws) return res.status(404).json({ error: 'Not set up yet.' });
    res.set('Access-Control-Allow-Origin', '*').json({ name: ws.name, algorithm: 'Ed25519', key: signingKey.publicKey(), fingerprint: signingKey.fingerprint() });
  });

  // An open feed of publicly listed bounties, for anyone to index: other Nil servers,
  // aggregators, bots. Only tasks a team explicitly listed ever appear here.
  app.get('/.well-known/nonos-bounties.json', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*').set('Cache-Control', 'public, max-age=60').json(listedBounties());
  });

  // AI assistants connect here with a personal access key (Model Context Protocol).
  app.use('/mcp', noStore, mcp);

  // Uploads stream as raw bytes; everything else in the API is JSON.
  const json = express.json({ limit: '1mb' });
  const isUpload = (req) => req.method === 'POST' && (/^\/tasks\/[^/]+\/attachments$/.test(req.path) || req.path === '/auth/restore');
  app.use('/api', noStore, (req, res, next) => (isUpload(req) ? next() : json(req, res, next)), csrfGuard, api);

  if (fs.existsSync(DIST)) {
    // the service worker must always be fresh, or a stale one could pin an old app forever
    app.get('/sw.js', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(DIST, 'sw.js'));
    });
    app.use('/assets', express.static(path.join(DIST, 'assets'), { immutable: true, maxAge: '1y', index: false }));
    app.use(express.static(DIST, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(DIST, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => res.type('text').send('Nil API is running. Run `npm run build` for the web app, or `npm run dev` and open http://localhost:5173.'));
  }

  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body wasn’t valid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
