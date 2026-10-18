import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// Stamps a production build with an id taken from its own file names, which carry content
// hashes, so the same sources always get the same id. The page carries the id in a meta tag and
// the server reads it from build.json; an open tab compares the two to notice a deploy.
// build.json also lists the SHA-256 of the page and of every file under /assets, as written to
// disk, so the service worker can check what it stores against the build it belongs to.
export default function buildStamp(): Plugin {
  let id = '';
  return {
    name: 'nil-build-stamp',
    apply: 'build',
    // after Vite has written index.html into the bundle
    enforce: 'post',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter((name) => name !== 'index.html')
        .sort();
      id = createHash('sha256').update(files.join('\n')).digest('base64url').slice(0, 16);
      const page = bundle['index.html'];
      if (page?.type !== 'asset' || typeof page.source !== 'string') this.error('index.html is missing from the bundle, so the build id has nowhere to go.');
      page.source = page.source.replace('</head>', `  <meta name="nil-build" content="${id}" />\n  </head>`);
    },
    // hashed from disk, once every file is in its final form
    writeBundle(options, bundle) {
      const dir = options.dir ?? 'dist';
      const names = Object.keys(bundle)
        .filter((name) => name === 'index.html' || name.startsWith('assets/'))
        .sort();
      const files = Object.fromEntries(names.map((name) => [`/${name}`, createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex')]));
      fs.writeFileSync(path.join(dir, 'build.json'), `${JSON.stringify({ id, files })}\n`);
    },
  };
}
