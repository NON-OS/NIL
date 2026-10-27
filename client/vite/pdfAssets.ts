import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

// pdf.js fetches a few files of its own while it renders: image decoders as WebAssembly (JPEG
// 2000, JBIG2, colour profiles), the Adobe CMaps for fonts a PDF names but doesn't embed (most
// Chinese, Japanese and Korean text) and the standard fonts. The Content Security Policy keeps
// every fetch on this server, so they're copied into the build under a folder named after the
// pdf.js version, where the app asks for them. The scripting sandbox isn't copied: previews
// never run a PDF's scripts.
const require = createRequire(import.meta.url);
const ROOT = path.dirname(require.resolve('pdfjs-dist/package.json'));
const VERSION: string = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const FOLDERS = ['wasm', 'cmaps', 'standard_fonts', 'iccs'];
const SKIP = /^(quickjs|LICENSE)/;
const BASE = `assets/pdfjs-${VERSION}`;

const files = () =>
  FOLDERS.flatMap((folder) =>
    fs
      .readdirSync(path.join(ROOT, folder))
      .filter((name) => !SKIP.test(name) && !name.endsWith('.js'))
      .map((name) => ({ name: `${folder}/${name}`, file: path.join(ROOT, folder, name) })),
  );

export default function pdfAssets(): Plugin {
  return {
    name: 'nil-pdf-assets',
    generateBundle() {
      for (const { name, file } of files()) this.emitFile({ type: 'asset', fileName: `${BASE}/${name}`, source: fs.readFileSync(file) });
    },
    // the dev server hands out the same files straight from node_modules
    configureServer(server) {
      const known = new Map(files().map((f) => [`/${BASE}/${f.name}`, f.file]));
      server.middlewares.use((req, res, next) => {
        const file = known.get((req.url ?? '').split('?')[0]);
        if (!file) return next();
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}
