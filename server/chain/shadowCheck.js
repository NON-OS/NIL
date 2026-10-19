import config from '../config.js';
import log from '../lib/log.js';
import logLimited from '../lib/logLimited.js';
import verifyHealth from './verifyHealth.js';
import sameState from './shadow/sameState.js';
import sameReceipt from './shadow/sameReceipt.js';
import sameLogs from './shadow/sameLogs.js';
import sameBlock from './shadow/sameBlock.js';

// The reads whose answers can be held against a proof. Block numbers and the chain ID can't
// be: the node and the verifier are rarely at exactly the same head.
const CHECKS = {
  eth_call: sameState,
  eth_getBalance: sameState,
  eth_getTransactionCount: sameState,
  eth_getCode: sameState,
  eth_getTransactionReceipt: sameReceipt,
  eth_getLogs: sameLogs,
  eth_getBlockByNumber: sameBlock,
};

// A block the light client can't prove even after a check falls back to one it can: expected now
// and then (a receipt from days ago), and no sign that anything is wrong.
const EXPECTED = new Set(['out-of-range']);

const running = new Set();

// Shadow mode (NOX_VERIFIER_MODE=shadow): the node's answer has already been used, as it
// always was; this checks it through the verifier on the side and never holds anything up. A
// proven contradiction raises the admins' notice and an error line, which the hosted control
// plane turns into an operator alert; an answer it couldn't check is only logged, with the
// reason, and an answer with nothing in it to check (no receipt, no logs) not even that. `node`
// re-asks the node without starting another shadow check. Nothing about the read itself (an
// address, a hash) is logged.
export default function shadowCheck(method, params, answer, node) {
  const check = CHECKS[method];
  if (!check) return;
  if (running.size >= config.verification.shadowMax) {
    logLimited('verification:shadow:busy', 'warn', 'verification', 'Too many shadow checks at once, so some chain reads went unchecked.');
    return;
  }
  const run = check(method, params, answer, node)
    .then((outcome) => {
      if (outcome === 'skipped') return;
      if (outcome === 'same') verifyHealth.proven();
      else if (outcome === 'differs') {
        verifyHealth.failed('mismatch');
        log.error('verification', `The Ethereum node answered ${method} with something Nil’s verifier proved false. Nil acted on it, since verification is in shadow mode. Check the node, and recent payments and votes.`);
      } else {
        const reason = outcome?.reason ?? 'unknown';
        logLimited(`verification:shadow:${method}:${reason}`, EXPECTED.has(reason) ? 'info' : 'warn', 'verification', `A ${method} answer couldn’t be checked through the verifier (${reason}). Nothing waits on that in shadow mode.`);
      }
    })
    .catch((err) => logLimited('verification:shadow:error', 'warn', 'verification', 'A shadow check failed.', err))
    .finally(() => running.delete(run));
  running.add(run);
}

// for tests and shutdown: resolves once every shadow check started so far is done
shadowCheck.idle = () => Promise.all([...running]);
