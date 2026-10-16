import fs from 'node:fs';
import path from 'node:path';

function format(fields) {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const text = v instanceof Error ? v.message : String(v);
      return ` ${k}=${/^[\w.:@/+-]+$/.test(text) ? text : JSON.stringify(text)}`;
    })
    .join('');
}

// One line per event on stdout (Docker rotates that) and in <dir>/control.log, rotated by size.
// Callers never pass wallet or IP addresses: wallets go through walletTagger, IPs not at all.
export default function createLog({ dir, fileBytes = 10 * 1024 * 1024, files = 5, stdout = true, file = true }) {
  const target = path.join(dir, 'control.log');
  if (file) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  function rotate() {
    for (let i = files - 1; i >= 1; i--) {
      const from = i === 1 ? target : `${target}.${i - 1}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${target}.${i}`);
    }
  }

  function write(level, event, fields = {}) {
    const line = `${new Date().toISOString()} ${level} ${event}${format(fields)}\n`;
    if (stdout) (level === 'error' ? process.stderr : process.stdout).write(line);
    if (!file) return;
    try {
      if (fs.existsSync(target) && fs.statSync(target).size + line.length > fileBytes) rotate();
      fs.appendFileSync(target, line, { mode: 0o600 });
    } catch (err) {
      // a full disk must not take the control plane down with it; stdout still has the line
      if (stdout) process.stderr.write(`log file write failed: ${err.message}\n`);
    }
  }

  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}
