import redact from './redact.js';

// LOG_FORMAT is read here and not from config.js, because config.js reports its own warnings
// through this logger. config.js still checks the value and warns about a typo.
const asJson = (process.env.LOG_FORMAT ?? '').trim() === 'json';

const LABEL = { info: 'INFO ', warn: 'WARN ', error: 'ERROR' };

function errorParts(err) {
  if (err === undefined || err === null) return null;
  if (err instanceof Error) return { message: err.message, code: err.code, stack: err.stack };
  return { message: String(err) };
}

// One line per event: a timestamp, the level, where it came from and what happened. Only an
// unexpected error carries its stack. Callers pass what they mean to say, never a request, so
// bodies, cookies and headers can't end up here by accident.
function write(level, scope, message, err) {
  const time = new Date().toISOString();
  const error = errorParts(err);
  const stack = level === 'error' ? error?.stack : undefined;
  let line;
  if (asJson) {
    line = JSON.stringify({ time, level, scope, message, error: error?.message, code: error?.code, stack });
  } else {
    line = `${time} ${LABEL[level]} [${scope}] ${message}`;
    if (stack) line += `\n${stack}`;
    else if (error) line += `: ${error.message}`;
  }
  (level === 'info' ? process.stdout : process.stderr).write(`${redact(line)}\n`);
}

const log = {
  info: (scope, message) => write('info', scope, message),
  warn: (scope, message, err) => write('warn', scope, message, err),
  error: (scope, message, err) => write('error', scope, message, err),
};

export default log;
