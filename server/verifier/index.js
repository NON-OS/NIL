import config from '../config/verifier.js';
import log from '../lib/log.js';
import startVerifier from './startVerifier.js';

// Nil's verifier: `node server/verifier/index.js`, one per host, in front of the Ethereum node
// that every Nil server on it uses. See docs/self-hosting.md, "Verified chain reads".
const verifier = await startVerifier({ config });
log.info('verifier', `Nil’s verifier is listening on ${config.host}:${verifier.server.address().port} for ${config.network}.`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    verifier.close().finally(() => process.exit(0));
  });
}
