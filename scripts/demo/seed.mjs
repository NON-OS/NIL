// Fills the running demo server with the Northwind team's workspace, through real browsers with
// real wallets signing. Parts already there are skipped, so it is safe to run again.
//
//   npm run demo:seed [-- --only <assets|work|keys|docs|comments|chat|files>]
import { parseArgs } from 'node:util';
import serverInfo from './lib/serverInfo.mjs';
import withBrowser from './lib/withBrowser.mjs';
import seedAll from './seed/seedAll.mjs';

const { values } = parseArgs({ options: { only: { type: 'string' } } });
// making the files to upload is the one part that needs no server
const server = values.only === 'assets' ? null : serverInfo();
await withBrowser((browser) => seedAll(browser, server, values.only));
