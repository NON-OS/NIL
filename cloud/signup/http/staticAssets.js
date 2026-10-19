import fs from 'node:fs';
import { createRequire } from 'node:module';
import assetTag from './assetTag.js';

const require = createRequire(import.meta.url);
const pub = (file) => new URL(`../../public/${file}`, import.meta.url);
// built by npm run build:phone, or by the image's build stage; never committed
const PHONE = new URL('../../dist/phone.js', import.meta.url);
// The page's own code and styles change with every release but keep their address, so the
// browser asks each time and gets a 304 while its copy is current. Kept for a day, a returning
// visitor would run yesterday's script against today's page. Fonts and the icon never change.
const REVALIDATE = 'no-cache';
const KEEP = 'public, max-age=86400';

// The only files the sign-up site serves, read once at startup. A fixed list rather than a
// directory, so no request path is ever turned into a file path. The phone wallet script is on
// the list only while phone wallets are on.
export default function staticAssets({ phone = false } = {}) {
  const files = {
    '/assets/signup.css': [pub('signup.css'), 'text/css; charset=utf-8', REVALIDATE],
    '/assets/signup.js': [pub('signup.js'), 'text/javascript; charset=utf-8', REVALIDATE],
    '/assets/favicon.svg': [pub('favicon.svg'), 'image/svg+xml', KEEP],
    '/assets/fonts/geist.woff2': [require.resolve('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'), 'font/woff2', KEEP],
    '/assets/fonts/jetbrains-mono.woff2': [require.resolve('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'), 'font/woff2', KEEP],
  };
  if (phone) {
    if (!fs.existsSync(PHONE)) throw new Error('WALLETCONNECT_PROJECT_ID is set, but dist/phone.js hasn’t been built. Run npm run build:phone, or use the control plane image, which has it.');
    files['/assets/phone.js'] = [PHONE, 'text/javascript; charset=utf-8', REVALIDATE];
  }
  return new Map(
    Object.entries(files).map(([route, [file, type, cache]]) => {
      const body = fs.readFileSync(file);
      return [route, { body, type, cache, etag: assetTag(body) }];
    }),
  );
}
