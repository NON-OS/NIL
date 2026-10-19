import log from '../lib/log.js';
import logLimited from '../lib/logLimited.js';
import checkpointFile from './checkpointFile.js';

const EVERY_MS = 12_000;
// how many head checks pass between two saves of the newest checkpoint, about every ten minutes
const SAVE_EVERY = 50;

// Keeps the time of the newest block the light client has, so a client that stopped following
// the chain (its consensus node went away) answers nothing rather than old state, and saves the
// newest finalized checkpoint now and then for the next start. Returns a function that stops it.
// A WebAssembly trap means Helios's own code aborted (a Rust panic, such as a library finding no
// browser global under Node): its memory can't be trusted after that, so the process exits and
// the container's restart policy brings up a fresh light client from the saved checkpoint.
export default function watchHead(state, { dataDir }, { fatal = () => process.exit(1) } = {}) {
  let checks = 0;
  async function check() {
    try {
      const head = await state.client.request({ method: 'eth_getBlockByNumber', params: ['latest', false] });
      const time = Number(BigInt(head?.timestamp ?? 0)) * 1000;
      if (time > state.headAt) state.headAt = time;
      if (checks++ % SAVE_EVERY === 0) checkpointFile.write(dataDir, await state.client.request({ method: 'helios_getCurrentCheckpoint', params: [] }));
    } catch (err) {
      if (err instanceof WebAssembly.RuntimeError) {
        log.error('verifier', 'The light client aborted inside its WebAssembly code. Restarting the verifier so it starts clean.', err);
        fatal();
        return;
      }
      logLimited('verifier:head', 'warn', 'verifier', 'The light client couldn’t read its newest block. It keeps trying.', err);
    }
  }
  const timer = setInterval(check, EVERY_MS);
  timer.unref();
  return {
    first: check(),
    stop: () => clearInterval(timer),
  };
}
