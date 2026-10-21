import createLog from './lib/createLog.js';
import egressConfig from './egress/egressConfig.js';
import createEgressProxy from './egress/createEgressProxy.js';

// The egress proxy's container (docker-compose.yml, the egress service). It keeps nothing on
// disk and logs to stdout only, which Docker rotates.
const { config, warnings, errors } = egressConfig();
for (const warning of warnings) console.warn(`[config] ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`[config] ${error}`);
  process.exit(2);
}

const log = createLog({ dir: '/tmp', file: false });
const server = createEgressProxy(config, { log });
server.listen(config.port, '0.0.0.0', () => log.info('egress.started', { port: config.port, ports: config.allowPorts.join(',') }));

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
