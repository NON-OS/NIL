import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

// Stamps a production build with an id taken from its own file names, which carry content
// hashes, so the same sources always get the same id. The page carries the id in a meta tag and
// the server reads it from build.json; an open tab compares the two to notice a deploy.
export default function buildStamp(): Plugin {
  return {
    name: 'nil-build-stamp',
    apply: 'build',
    // after Vite has written index.html into the bundle
    enforce: 'post',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter((name) => name !== 'index.html')
        .sort();
      const id = createHash('sha256').update(files.join('\n')).digest('base64url').slice(0, 16);
      const page = bundle['index.html'];
      if (page?.type !== 'asset' || typeof page.source !== 'string') this.error('index.html is missing from the bundle, so the build id has nowhere to go.');
      page.source = page.source.replace('</head>', `  <meta name="nil-build" content="${id}" />\n  </head>`);
      this.emitFile({ type: 'asset', fileName: 'build.json', source: `${JSON.stringify({ id })}\n` });
    },
  };
}
