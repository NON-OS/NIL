import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// The prover is a separate program with a build of its own (npm run build:prover), so the dev
// server can't make it from the app's sources. This hands the browser that build's file at the
// same address a production server uses.
export default function devProver(dir: string): Plugin {
  return {
    name: 'nil-dev-prover',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/prover', (req, res, next) => {
        const name = path.basename((req.url ?? '').split('?')[0]);
        const file = path.join(dir, name);
        if (!name || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}
