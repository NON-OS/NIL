import quietSqliteWarning from './lib/quietSqliteWarning.js';

// files this process creates (backup key files, temporary copies) are private
process.umask(0o077);
quietSqliteWarning();
const { default: main } = await import('./cli/main.js');
process.exitCode = await main(process.argv.slice(2));
