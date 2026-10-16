import quietSqliteWarning from './lib/quietSqliteWarning.js';

// files this process creates (the database and its WAL, logs, temporary copies) are private
process.umask(0o077);
quietSqliteWarning();
await import('./server.js');
