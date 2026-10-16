import { spawn } from 'node:child_process';
import { once } from 'node:events';

const SERVER = new URL('../../index.js', import.meta.url).pathname;

// Starts the real server entry point in its own process, the way production runs it, on a free
// port. Resolves once it's listening, or with the exit code if it never gets there.
export default async function bootProcess({ dataDir, env = {} }) {
  const { SETUP_TOKEN, ...inherited } = process.env;
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', SERVER], {
    env: { ...inherited, APP_URL: 'http://localhost:3000', NOX_RPC_URL: 'off', DATA_DIR: dataDir, PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const exited = once(child, 'exit').then(([code]) => code);
  const port = await new Promise((resolve) => {
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const match = /listening on [^:]+:(\d+)/.exec(stdout);
      if (match) resolve(Number(match[1]));
    });
    exited.then(() => resolve(null));
  });
  return {
    base: port ? `http://127.0.0.1:${port}` : null,
    exited,
    stdout: () => stdout,
    stderr: () => stderr,
    // sends the signal a supervisor would and resolves with the exit code
    stop(signal = 'SIGTERM') {
      child.kill(signal);
      return exited;
    },
  };
}
