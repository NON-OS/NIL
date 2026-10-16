import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pub = (file) => new URL(`../../public/${file}`, import.meta.url);

// The only files the sign-up site serves, read once at startup. A fixed list rather than a
// directory, so no request path is ever turned into a file path.
export default function staticAssets() {
  const files = {
    '/assets/signup.css': [pub('signup.css'), 'text/css; charset=utf-8'],
    '/assets/signup.js': [pub('signup.js'), 'text/javascript; charset=utf-8'],
    '/assets/favicon.svg': [pub('favicon.svg'), 'image/svg+xml'],
    '/assets/fonts/geist.woff2': [require.resolve('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2'), 'font/woff2'],
    '/assets/fonts/jetbrains-mono.woff2': [require.resolve('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'), 'font/woff2'],
  };
  return new Map(Object.entries(files).map(([route, [file, type]]) => [route, { body: fs.readFileSync(file), type }]));
}
