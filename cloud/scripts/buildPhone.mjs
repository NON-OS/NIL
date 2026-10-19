// Builds dist/phone.js: the sign-up page's phone wallet dialog with WalletConnect's client, in the
// one file the page loads when someone picks a phone wallet. The image's build stage runs this
// too (see Dockerfile); what it builds is never committed. Licence notices stay at the end.
//   npm run build:phone
import { build } from 'esbuild';

await build({
  entryPoints: [new URL('../phone/phoneSignup.js', import.meta.url).pathname],
  outfile: new URL('../dist/phone.js', import.meta.url).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  logLevel: 'warning',
});
