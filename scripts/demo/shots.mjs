// Screenshots of every main screen of the seeded demo workspace, as Ada, at 2x on a desktop and
// 3x on a phone. They go to shots/ in the demo folder unless --out names another.
//
//   npm run demo:shots [-- --out <dir>] [-- --only <name>]
import path from 'node:path';
import { parseArgs } from 'node:util';
import demoDir from './lib/demoDir.mjs';
import serverInfo from './lib/serverInfo.mjs';
import withBrowser from './lib/withBrowser.mjs';
import capture from './shots/capture.mjs';

const { values } = parseArgs({ options: { out: { type: 'string' }, only: { type: 'string' } } });
const out = path.resolve(values.out ?? path.join(demoDir, 'shots'));
const { base } = serverInfo();
const failed = await withBrowser((browser) => capture(browser, base, { out, only: values.only }));
console.log(failed ? `${failed} screenshots failed; the rest are in ${out}` : `Screenshots in ${out}`);
process.exitCode = failed ? 1 : 0;
