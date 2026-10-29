// The whole demo in one go: a fresh server, the seed, every screenshot, then the server stops.
// See README.md here for running the steps one at a time.
//
//   npm run demo [-- --keep]
import path from 'node:path';
import makeAssets from './assets/makeAssets.mjs';
import demoDir from './lib/demoDir.mjs';
import startServer from './lib/startServer.mjs';
import step from './lib/step.mjs';
import withBrowser from './lib/withBrowser.mjs';
import seedAll from './seed/seedAll.mjs';
import capture from './shots/capture.mjs';

const server = await startServer({ keep: process.argv.includes('--keep') });
step(`server at ${server.base}${server.relay ? ', with a coturn relay' : ''}`);
try {
  await withBrowser(makeAssets);
  await withBrowser((browser) => seedAll(browser, server));
  const out = path.join(demoDir, 'shots');
  const failed = await withBrowser((browser) => capture(browser, server.base, { out }));
  console.log(failed ? `${failed} screenshots failed; the rest are in ${out}` : `Screenshots in ${out}`);
  process.exitCode = failed ? 1 : 0;
} finally {
  server.stop();
}
