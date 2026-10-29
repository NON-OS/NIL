// Runs the demo server until stopped. Each start begins with an empty workspace unless --keep
// is given, which carries on with the one already in the demo folder.
//
//   npm run demo:server [-- --keep]
import demoDir from './lib/demoDir.mjs';
import startServer from './lib/startServer.mjs';

const server = await startServer({ keep: process.argv.includes('--keep') });
console.log(`Demo server at ${server.base}${server.relay ? ', with a coturn relay' : ''}. Data in ${demoDir}`);
const stop = () => (server.stop(), process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
setInterval(() => {}, 1 << 30);
